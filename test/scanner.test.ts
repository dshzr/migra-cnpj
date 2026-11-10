import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanDirectory, scanText } from "../src/scanner";

const regras = (codigo: string, arquivo = "exemplo.ts") =>
  scanText(codigo, arquivo).map((achado) => achado.rule);

describe("scanText", () => {
  it("aponta regex que só aceita dígitos", () => {
    expect(regras("const re = /^\\d{14}$/;")).toContain("regex-so-digitos");
    expect(regras("const re = /^[0-9]{14}$/;")).toContain("regex-so-digitos");
    expect(
      regras("const re = /^\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}$/;"),
    ).toContain("regex-so-digitos");
  });

  it("aponta limpeza que apaga as letras", () => {
    expect(regras("const limpo = cnpj.replace(/\\D/g, '');")).toContain("limpeza-remove-letras");
    expect(regras("$cnpj = preg_replace('/[^0-9]/', '', $cnpj);", "a.php")).toContain(
      "limpeza-remove-letras",
    );
    expect(regras("cnpj = re.sub(r'[^\\d]', '', cnpj)", "a.py")).toContain(
      "limpeza-remove-letras",
    );
  });

  it("não aponta limpeza de dígitos sem relação com CNPJ", () => {
    expect(regras("const tel = telefone.replace(/\\D/g, '');")).toEqual([]);
  });

  it("aponta conversão para número", () => {
    expect(regras("const n = parseInt(cnpj, 10);")).toContain("conversao-numerica");
    expect(regras("const n = Number(empresa.cnpj);")).toContain("conversao-numerica");
    expect(regras("n = int(cnpj)", "a.py")).toContain("conversao-numerica");
    expect(regras("$n = intval($cnpj);", "a.php")).toContain("conversao-numerica");
  });

  it("aponta checagem de só dígitos", () => {
    expect(regras("if cnpj.isdigit():", "a.py")).toContain("checagem-so-digitos");
    expect(regras("if (!ctype_digit($cnpj)) {", "a.php")).toContain("checagem-so-digitos");
    expect(regras("if (isNaN(cnpj)) return false;")).toContain("checagem-so-digitos");
  });

  it("aponta coluna e tipo numérico", () => {
    expect(regras("  cnpj BIGINT NOT NULL,", "schema.sql")).toContain("tipo-numerico");
    expect(regras("  cnpj numeric(14) not null,", "schema.sql")).toContain("tipo-numerico");
    expect(regras("$table->bigInteger('cnpj');", "m.php")).toContain("tipo-numerico");
    expect(regras("  cnpj: number;")).toContain("tipo-numerico");
    expect(regras("private Long cnpj;", "A.java")).toContain("tipo-numerico");
    expect(regras("  cnpj BigInt @unique", "schema.prisma")).toContain("tipo-numerico");
  });

  it("não aponta coluna de texto", () => {
    expect(regras("  cnpj VARCHAR(14) NOT NULL,", "schema.sql")).toEqual([]);
    expect(regras("  cnpj: string;")).toEqual([]);
  });

  it("aponta campo de formulário só numérico, mesmo em linhas vizinhas", () => {
    const jsx = ["<input", '  name="cnpj"', '  inputMode="numeric"', "/>"].join("\n");
    const achados = scanText(jsx, "Form.tsx");
    expect(achados.map((a) => a.rule)).toContain("campo-so-numerico");
    expect(achados[0]?.line).toBe(3);
    expect(regras('<input type="number" name="cnpj" />', "a.html")).toContain("campo-so-numerico");
    expect(regras('<TextInput placeholder="CNPJ" keyboardType="numeric" />', "A.tsx")).toContain(
      "campo-so-numerico",
    );
  });

  it("aponta máscara fixa só de dígitos", () => {
    expect(regras('<InputMask mask="99.999.999/9999-99" />', "A.tsx")).toContain(
      "mascara-so-digitos",
    );
    expect(regras("$('#doc').mask('00.000.000/0000-00');", "a.js")).toContain(
      "mascara-so-digitos",
    );
  });

  it("usa o nome do arquivo como contexto de CNPJ", () => {
    expect(regras("return valor.replace(/\\D/g, '');", "utils/cnpj.ts")).toContain(
      "limpeza-remove-letras",
    );
  });

  it("devolve linha, coluna e trecho", () => {
    const [achado] = scanText("\n\n  const n = parseInt(cnpj, 10);", "a.ts");
    expect(achado).toMatchObject({
      file: "a.ts",
      line: 3,
      column: 13,
      rule: "conversao-numerica",
      snippet: "const n = parseInt(cnpj, 10);",
    });
    expect(achado?.message).toBeTruthy();
  });

  it("troca caracteres de controle do trecho, para não mexer no terminal", () => {
    const [achado] = scanText("Number(cnpj); \u001b[2J\u001b]0;pwn\u0007 \u009b", "a.ts");
    expect(achado?.snippet).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(achado?.snippet).toContain("�");
  });

  it("respeita o comentário migra-cnpj-ignore", () => {
    expect(regras("const n = parseInt(cnpj, 10); // migra-cnpj-ignore")).toEqual([]);
    expect(regras("// migra-cnpj-ignore\nconst n = parseInt(cnpj, 10);")).toEqual([]);
  });

  it("não aponta código já compatível", () => {
    const ok = [
      "import { isValid, strip } from 'migra-cnpj';",
      "const limpo = strip(cnpj);",
      "if (!isValid(cnpj)) throw new Error('CNPJ inválido');",
      "const re = /^[0-9A-Z]{12}\\d{2}$/;",
    ].join("\n");
    expect(regras(ok)).toEqual([]);
  });
});

describe("scanDirectory", () => {
  let raiz: string;

  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), "migra-cnpj-"));
    await mkdir(join(raiz, "src"));
    await mkdir(join(raiz, "node_modules", "pacote"), { recursive: true });
    await writeFile(join(raiz, "src", "empresa.ts"), "const n = Number(cnpj);\n");
    await writeFile(join(raiz, "src", "ok.ts"), "export const x = 1;\n");
    await writeFile(join(raiz, "node_modules", "pacote", "index.js"), "Number(cnpj)\n");
    await writeFile(join(raiz, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
  });

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("varre a pasta, ignora node_modules e binários", async () => {
    const resultado = await scanDirectory(raiz);
    expect(resultado.filesScanned).toBe(2);
    expect(resultado.findings).toHaveLength(1);
    expect(resultado.findings[0]).toMatchObject({
      file: join("src", "empresa.ts"),
      line: 1,
      rule: "conversao-numerica",
    });
  });

  it("aceita pastas extras para ignorar", async () => {
    const resultado = await scanDirectory(raiz, { ignore: ["src"] });
    expect(resultado.findings).toEqual([]);
  });
});
