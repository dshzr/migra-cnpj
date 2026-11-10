import { describe, expect, it } from "vitest";
import {
  checkDigits,
  format,
  generate,
  isAlphanumeric,
  isValid,
  mask,
  strip,
} from "../src/index";

// Exemplo oficial da Receita Federal para o CNPJ alfanumérico.
const OFICIAL = "12ABC34501DE35";
const OFICIAL_FORMATADO = "12.ABC.345/01DE-35";
const NUMERICO = "11222333000181";

describe("strip", () => {
  it("remove a pontuação e converte para maiúsculas", () => {
    expect(strip("12.abc.345/01de-35")).toBe(OFICIAL);
    expect(strip("  11.222.333/0001-81 ")).toBe(NUMERICO);
  });

  it("devolve string vazia para o que não é texto", () => {
    expect(strip(undefined)).toBe("");
    expect(strip(null)).toBe("");
    expect(strip(11222333000181)).toBe("");
  });
});

describe("checkDigits", () => {
  it("calcula os DVs do exemplo oficial", () => {
    expect(checkDigits("12ABC34501DE")).toBe("35");
    expect(checkDigits("12.ABC.345/01DE")).toBe("35");
  });

  it("calcula os DVs de um CNPJ numérico", () => {
    expect(checkDigits("112223330001")).toBe("81");
  });

  it("lança erro quando a base não tem 12 posições válidas", () => {
    expect(() => checkDigits("123")).toThrow(TypeError);
    expect(() => checkDigits("12ABC34501D!")).toThrow(TypeError);
  });
});

describe("isValid", () => {
  it("aceita o exemplo oficial, com e sem máscara", () => {
    expect(isValid(OFICIAL)).toBe(true);
    expect(isValid(OFICIAL_FORMATADO)).toBe(true);
  });

  it("aceita CNPJ numérico antigo", () => {
    expect(isValid(NUMERICO)).toBe(true);
    expect(isValid("11.222.333/0001-81")).toBe(true);
  });

  it("aceita letras minúsculas", () => {
    expect(isValid("12.abc.345/01de-35")).toBe(true);
  });

  it("rejeita DV errado", () => {
    expect(isValid("12ABC34501DE36")).toBe(false);
    expect(isValid("11222333000182")).toBe(false);
  });

  it("rejeita letra nas posições do DV", () => {
    expect(isValid("12ABC34501DE3A")).toBe(false);
    expect(isValid("12ABC34501DEA5")).toBe(false);
  });

  it("rejeita tamanho errado e caracteres estranhos", () => {
    expect(isValid("12ABC34501DE3")).toBe(false);
    expect(isValid("12ABC34501DE355")).toBe(false);
    expect(isValid("12ÁBC34501DE35")).toBe(false);
    expect(isValid("12_ABC_345_01DE_35")).toBe(false);
    expect(isValid("")).toBe(false);
  });

  it("rejeita sequências repetidas", () => {
    expect(isValid("00000000000000")).toBe(false);
    expect(isValid("11111111111111")).toBe(false);
  });

  it("rejeita o que não é texto", () => {
    expect(isValid(11222333000181)).toBe(false);
    expect(isValid(null)).toBe(false);
    expect(isValid(undefined)).toBe(false);
    expect(isValid({})).toBe(false);
  });

  it("no modo estrito exige maiúsculas e máscara exata ou nenhuma", () => {
    expect(isValid(OFICIAL, { strict: true })).toBe(true);
    expect(isValid(OFICIAL_FORMATADO, { strict: true })).toBe(true);
    expect(isValid("12.abc.345/01de-35", { strict: true })).toBe(false);
    expect(isValid("12.ABC.345/01DE35", { strict: true })).toBe(false);
    expect(isValid(" 12ABC34501DE35", { strict: true })).toBe(false);
  });
});

describe("format", () => {
  it("aplica a máscara", () => {
    expect(format(OFICIAL)).toBe(OFICIAL_FORMATADO);
    expect(format("12abc34501de35")).toBe(OFICIAL_FORMATADO);
    expect(format(NUMERICO)).toBe("11.222.333/0001-81");
  });

  it("lança erro quando não há 14 posições", () => {
    expect(() => format("123")).toThrow(TypeError);
  });
});

describe("mask", () => {
  it("formata o que foi digitado até o momento", () => {
    expect(mask("")).toBe("");
    expect(mask("12")).toBe("12");
    expect(mask("12a")).toBe("12.A");
    expect(mask("12abc345")).toBe("12.ABC.345");
    expect(mask("12abc34501de")).toBe("12.ABC.345/01DE");
    expect(mask("12abc34501de35")).toBe(OFICIAL_FORMATADO);
  });

  it("descarta o que passa de 14 posições e caracteres inválidos", () => {
    expect(mask("12abc34501de35999")).toBe(OFICIAL_FORMATADO);
    expect(mask("12#abc")).toBe("12.ABC");
  });

  it("não deixa letra entrar nas posições do DV", () => {
    expect(mask("12abc34501dexy")).toBe("12.ABC.345/01DE");
    expect(mask("12abc34501de3x5")).toBe("12.ABC.345/01DE-35");
  });
});

describe("isAlphanumeric", () => {
  it("diferencia os dois formatos", () => {
    expect(isAlphanumeric(OFICIAL_FORMATADO)).toBe(true);
    expect(isAlphanumeric(NUMERICO)).toBe(false);
  });
});

describe("generate", () => {
  it("gera CNPJ alfanumérico válido por padrão", () => {
    for (let i = 0; i < 500; i++) {
      const cnpj = generate();
      expect(cnpj).toHaveLength(14);
      expect(isValid(cnpj, { strict: true })).toBe(true);
    }
  });

  it("gera só números quando pedido", () => {
    for (let i = 0; i < 200; i++) {
      const cnpj = generate({ numeric: true });
      expect(cnpj).toMatch(/^\d{14}$/);
      expect(isValid(cnpj)).toBe(true);
    }
  });

  it("gera formatado", () => {
    const cnpj = generate({ formatted: true });
    expect(cnpj).toMatch(/^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/);
    expect(isValid(cnpj)).toBe(true);
  });

  it("é determinístico com uma fonte de aleatoriedade fixa", () => {
    const fixo = () => 0.5;
    expect(generate({ random: fixo })).toBe(generate({ random: fixo }));
  });
});
