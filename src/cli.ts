import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { format, generate, isAlphanumeric, isValid } from "./index";
import { sanitize, scanDirectory, type Finding } from "./scanner";

const HELP = `migra-cnpj — ferramentas para o CNPJ alfanumérico

Uso:
  migra-cnpj scan [caminho]        Aponta o que quebra com CNPJ alfanumérico (padrão: pasta atual)
      --json                     Saída em JSON
      --ignore <a,b>             Pastas ou arquivos a ignorar, separados por vírgula
  migra-cnpj validate <cnpj...>    Valida um ou mais CNPJs
  migra-cnpj format <cnpj...>      Aplica a máscara
  migra-cnpj generate              Gera CNPJ válido para teste
      -n, --count <n>            Quantidade (padrão: 1)
      --numeric                  Só números (formato antigo)
      --formatted                Com máscara

  -h, --help                     Mostra esta ajuda
  -v, --version                  Mostra a versão

Códigos de saída: 0 = tudo certo, 1 = há achados ou CNPJ inválido, 2 = uso incorreto.
Para silenciar uma linha no scan, adicione o comentário "migra-cnpj-ignore" nela ou na linha de cima.`;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (text: string) => paint(1, text);
const dim = (text: string) => paint(2, text);
const red = (text: string) => paint(31, text);
const green = (text: string) => paint(32, text);
const yellow = (text: string) => paint(33, text);

function fail(message: string): never {
  console.error(`${red("erro:")} ${message}\n\nRode "migra-cnpj --help" para ver o uso.`);
  process.exit(2);
}

function printFindings(findings: Finding[], filesScanned: number): void {
  if (findings.length === 0) {
    console.log(green(`Nenhum problema encontrado em ${filesScanned} arquivo(s).`));
    return;
  }

  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }

  for (const [file, list] of byFile) {
    console.log(`\n${bold(sanitize(file))}`);
    for (const finding of list) {
      console.log(
        `  ${dim(`${finding.line}:${finding.column}`)}  ${yellow(finding.rule)}  ${finding.message}`,
      );
      console.log(`      ${dim(finding.snippet)}`);
    }
  }

  const byRule = new Map<string, number>();
  for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);

  console.log(
    `\n${red(`${findings.length} ponto(s) a ajustar`)} em ${byFile.size} de ${filesScanned} arquivo(s):`,
  );
  for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${rule}`);
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      json: { type: "boolean" },
      ignore: { type: "string" },
      count: { type: "string", short: "n" },
      numeric: { type: "boolean" },
      formatted: { type: "boolean" },
    },
  });

  if (values.version) {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    console.log(pkg.version);
    return 0;
  }

  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "scan": {
      const target = args[0] ?? ".";
      const ignore = values.ignore?.split(",").map((item) => item.trim()).filter(Boolean);
      const result = await scanDirectory(target, { ignore }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") fail(`caminho não encontrado: ${target}`);
        throw error;
      });
      if (values.json) console.log(JSON.stringify(result, null, 2));
      else printFindings(result.findings, result.filesScanned);
      return result.findings.length > 0 ? 1 : 0;
    }

    case "validate": {
      if (args.length === 0) fail("informe ao menos um CNPJ");
      let allValid = true;
      for (const value of args) {
        const valid = isValid(value);
        allValid &&= valid;
        const kind = valid ? ` ${dim(isAlphanumeric(value) ? "(alfanumérico)" : "(numérico)")}` : "";
        console.log(`${valid ? green("válido  ") : red("inválido")}  ${value}${kind}`);
      }
      return allValid ? 0 : 1;
    }

    case "format": {
      if (args.length === 0) fail("informe ao menos um CNPJ");
      for (const value of args) {
        try {
          console.log(format(value));
        } catch {
          fail(`"${value}" não tem as 14 posições de um CNPJ`);
        }
      }
      return 0;
    }

    case "generate": {
      const count = Number(values.count ?? 1);
      if (!Number.isInteger(count) || count < 1) fail("--count precisa ser um inteiro maior que zero");
      for (let i = 0; i < count; i++) {
        console.log(generate({ numeric: values.numeric, formatted: values.formatted }));
      }
      return 0;
    }

    default:
      return fail(`comando desconhecido: ${command}`);
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`${red("erro:")} ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  },
);
