import { describe, expect, it } from "vitest";
import { cnpj } from "../src/zod";

describe("adapter Zod", () => {
  it("valida e devolve o CNPJ limpo", () => {
    expect(cnpj().parse("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });

  it("devolve formatado quando pedido", () => {
    expect(cnpj({ output: "formatted" }).parse("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });

  it("rejeita CNPJ inválido com a mensagem configurada", () => {
    const resultado = cnpj({ message: "CNPJ ruim" }).safeParse("12ABC34501DE36");
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe("CNPJ ruim");
  });

  it("rejeita o que não é texto", () => {
    expect(cnpj().safeParse(11222333000181).success).toBe(false);
  });
});
