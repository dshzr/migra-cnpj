import { z } from "zod";
import { format, isValid, strip } from "./index";

export interface CnpjSchemaOptions {
  /** Mensagem de erro. Padrão: "CNPJ inválido". */
  message?: string;
  /** Formato do valor devolvido: só as 14 posições (padrão) ou com máscara. */
  output?: "stripped" | "formatted";
  /** Exige maiúsculas e máscara exata ou nenhuma. */
  strict?: boolean;
}

/** Schema Zod que valida um CNPJ (numérico ou alfanumérico) e devolve o valor normalizado. */
export function cnpj(options: CnpjSchemaOptions = {}) {
  const { message = "CNPJ inválido", output = "stripped", strict = false } = options;
  return z
    .string()
    .refine((value) => isValid(value, { strict }), { message })
    .transform((value) => (output === "formatted" ? format(value) : strip(value)));
}
