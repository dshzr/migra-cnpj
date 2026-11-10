import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";

export type RuleId =
  | "regex-so-digitos"
  | "limpeza-remove-letras"
  | "conversao-numerica"
  | "checagem-so-digitos"
  | "tipo-numerico"
  | "campo-so-numerico"
  | "mascara-so-digitos";

export interface Finding {
  file: string;
  /** Linha, começando em 1. */
  line: number;
  /** Coluna, começando em 1. */
  column: number;
  rule: RuleId;
  message: string;
  /** A linha de código, sem a indentação. */
  snippet: string;
}

export interface ScanOptions {
  /** Pastas, arquivos ou caminhos relativos a ignorar, além dos padrões. */
  ignore?: string[];
}

export interface ScanResult {
  filesScanned: number;
  findings: Finding[];
}

interface Rule {
  id: RuleId;
  message: string;
  patterns: RegExp[];
  /**
   * Quantas linhas vizinhas podem trazer a palavra "cnpj" para o achado valer.
   * `null` = o próprio padrão já é específico de CNPJ.
   */
  context: number | null;
}

const D = String.raw`(?:\\d|\[0-9\])`;

export const RULES: readonly Rule[] = [
  {
    id: "regex-so-digitos",
    message:
      "Regex aceita só dígitos. As 12 primeiras posições do CNPJ agora aceitam letras: use [0-9A-Z]{12}\\d{2}.",
    context: null,
    patterns: [
      new RegExp(String.raw`${D}\{14\}`),
      new RegExp(
        String.raw`${D}\{2\}.{0,6}?${D}\{3\}.{0,6}?${D}\{3\}.{0,6}?${D}\{4\}.{0,6}?${D}\{2\}`,
      ),
    ],
  },
  {
    id: "limpeza-remove-letras",
    message:
      "Limpeza remove tudo que não é dígito e apaga as letras do CNPJ. Remova só a pontuação (. / -).",
    context: 0,
    patterns: [/\\D/, /\[\^0-9\]/, /\[\^\\d\]/],
  },
  {
    id: "conversao-numerica",
    message: "CNPJ convertido para número. Com letras a conversão falha ou perde dados: trate como texto.",
    context: 0,
    patterns: [
      /\b(?:parseInt|parseFloat|Number|BigInt|intval|floatval)\s*\(/,
      /\b(?:int|float|long)\s*\(/,
      /\b(?:Long\.parseLong|Long\.valueOf|Integer\.parseInt|Convert\.ToInt64|long\.Parse|Int64\.Parse)\s*\(/,
      /\(\s*(?:int|long|integer)\s*\)\s*\$?\w/,
      /\.to_i\b/,
    ],
  },
  {
    id: "checagem-so-digitos",
    message: "Checagem exige só dígitos e rejeita CNPJ com letras. Valide com o cálculo do DV.",
    context: 0,
    patterns: [
      /\.(?:isdigit|isnumeric|isdecimal)\s*\(/,
      /\b(?:is_numeric|ctype_digit|isNaN|isDigit|isNumeric)\s*\(/,
      /\bNumber\.isInteger\s*\(/,
    ],
  },
  {
    id: "tipo-numerico",
    message: "CNPJ guardado em tipo numérico. Mude para texto de 14 posições (CHAR(14) / string).",
    context: null,
    patterns: [
      /\bcnpj\w*["`\]]?\s+(?:bigint|int|integer|numeric|decimal|number|smallint|int4|int8)\b/i,
      /\bcnpj\w*\??\s*:\s*(?:number|bigint|int|Int|Long|Integer|BigInteger|BigInt|Float|float)\b/,
      /\b(?:bigInteger|unsignedBigInteger|integer|unsignedInteger|decimal|bigint|numeric)\s*\(\s*['"]\w*cnpj/i,
      /\bcnpj\w*\s*=\s*.*\b(?:BigIntegerField|PositiveBigIntegerField|IntegerField|DecimalField|BigInteger|Integer|Numeric)\b/,
      /\b(?:Long|long|Integer|int|BigInteger|BigDecimal|ulong|Int64)\s+\w*cnpj\w*\s*[;=,)]/i,
    ],
  },
  {
    id: "campo-so-numerico",
    message:
      "Campo do CNPJ abre teclado numérico ou só aceita números. Use texto com teclado alfanumérico.",
    context: 3,
    patterns: [
      /\binputmode\s*=\s*[{"'\s]*(?:numeric|decimal)\b/i,
      /\btype\s*=\s*["']number["']/i,
      /\bkeyboardType\s*=\s*[{"'\s]*(?:numeric|number-pad|decimal-pad)\b/,
      /\bTextInputType\.number\b/,
      /\bFilteringTextInputFormatter\.digitsOnly\b/,
    ],
  },
  {
    id: "mascara-so-digitos",
    message: "Máscara fixa só de dígitos. As 12 primeiras posições precisam aceitar letras.",
    context: null,
    patterns: [/99\.999\.999\/9999-99|00\.000\.000\/0000-00|##\.###\.###\/####-##/],
  },
];

const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Troca caracteres de controle (inclusive ESC) por "�", para o texto ser seguro de imprimir. */
export function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, "�");
}

const IGNORE_MARK = "migra-cnpj-ignore";
const CNPJ = /cnpj/i;
const PLACEHOLDER = /placeholder\s*[=:]\s*[{"'`\s]*$/i;

/** Procura, em um texto, trechos que quebram com o CNPJ alfanumérico. */
export function scanText(content: string, file: string): Finding[] {
  const lines = content.split(/\r?\n/);
  const fileIsAboutCnpj = CNPJ.test(basename(file));
  const mentions = lines.map((line) => CNPJ.test(line));
  const findings: Finding[] = [];

  const hasContext = (index: number, reach: number): boolean => {
    if (fileIsAboutCnpj) return true;
    for (let i = Math.max(0, index - reach); i <= Math.min(lines.length - 1, index + reach); i++) {
      if (mentions[i]) return true;
    }
    return false;
  };

  lines.forEach((line, index) => {
    if (line.includes(IGNORE_MARK) || lines[index - 1]?.includes(IGNORE_MARK)) return;

    for (const rule of RULES) {
      if (rule.context !== null && !hasContext(index, rule.context)) continue;

      for (const pattern of rule.patterns) {
        const match = pattern.exec(line);
        if (!match) continue;
        if (rule.id === "mascara-so-digitos" && PLACEHOLDER.test(line.slice(0, match.index))) {
          continue;
        }
        findings.push({
          file,
          line: index + 1,
          column: match.index + 1,
          rule: rule.id,
          message: rule.message,
          snippet: sanitize(line.trim().slice(0, 200)),
        });
        break;
      }
    }
  });

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "vendor",
  "coverage",
  "target",
  "Pods",
  "__pycache__",
  "venv",
  ".venv",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".gradle",
  ".idea",
  ".vscode",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
]);

const IGNORED_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".map", ".lock", ".log", ".svg", ".csv"]);

const MAX_FILE_SIZE = 1024 * 1024;

function isIgnored(relativePath: string, name: string, extra: readonly string[]): boolean {
  const normalized = relativePath.split(sep).join("/");
  return extra.some((entry) => {
    const clean = entry.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    return clean === name || normalized === clean || normalized.startsWith(`${clean}/`);
  });
}

async function* walk(root: string, dir: string, extra: readonly string[]): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (isIgnored(relative(root, path), entry.name, extra)) continue;

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(root, path, extra);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      if (IGNORED_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      if (/\.min\.(?:js|css)$/.test(entry.name)) continue;
      yield path;
    }
  }
}

async function readText(path: string): Promise<string | null> {
  const info = await stat(path);
  if (info.size > MAX_FILE_SIZE) return null;
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8000).includes(0)) return null;
  return buffer.toString("utf8");
}

/**
 * Varre uma pasta (ou um arquivo) e devolve os trechos que quebram com o CNPJ
 * alfanumérico. Pula dependências, saídas de build, binários e arquivos acima de 1 MB.
 */
export async function scanDirectory(target: string, options: ScanOptions = {}): Promise<ScanResult> {
  const extra = options.ignore ?? [];
  const info = await stat(target);
  const result: ScanResult = { filesScanned: 0, findings: [] };

  const scanFile = async (path: string, shown: string) => {
    const content = await readText(path);
    if (content === null) return;
    result.filesScanned++;
    result.findings.push(...scanText(content, shown));
  };

  if (info.isFile()) {
    await scanFile(target, target);
    return result;
  }

  for await (const path of walk(target, target, extra)) {
    await scanFile(path, relative(target, path));
  }
  return result;
}
