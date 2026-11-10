/**
 * CNPJ alfanumérico (Receita Federal, em vigor desde julho de 2026).
 *
 * São 14 posições: as 12 primeiras aceitam `0-9` e `A-Z`, as 2 últimas (dígitos
 * verificadores) seguem só numéricas. O cálculo continua no módulo 11; cada
 * caractere entra na conta como `código ASCII − 48` (`0`→0 … `9`→9, `A`→17 … `Z`→42).
 * CNPJs só numéricos seguem válidos pela mesma regra.
 */

const RAW = /^[0-9A-Z]{12}\d{2}$/;
const MASKED = /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/;
const BASE = /^[0-9A-Z]{12}$/;
const PUNCTUATION = /[.\/\-\s]/g;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface ValidateOptions {
  /**
   * Exige o valor exatamente como a Receita escreve: maiúsculas, e ou as 14
   * posições puras ou a máscara completa `AA.AAA.AAA/AAAA-DD`.
   * Por padrão a validação tolera minúsculas, espaços e máscara parcial.
   */
  strict?: boolean;
}

export interface GenerateOptions {
  /** Gera um CNPJ só com números (formato antigo). */
  numeric?: boolean;
  /** Devolve com máscara. */
  formatted?: boolean;
  /** Fonte de aleatoriedade, no formato de `Math.random`. Útil para seeds reproduzíveis. */
  random?: () => number;
}

/** Remove pontuação e espaços e converte para maiúsculas. Não valida. */
export function strip(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(PUNCTUATION, "").toUpperCase();
}

function digit(base: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += (base.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Calcula os dois dígitos verificadores das 12 primeiras posições.
 * Lança `TypeError` se a base não tiver 12 posições válidas.
 */
export function checkDigits(base: string): string {
  const clean = strip(base);
  if (!BASE.test(clean)) {
    throw new TypeError("A base do CNPJ precisa ter 12 posições com 0-9 ou A-Z");
  }
  const first = digit(clean);
  const second = digit(clean + first);
  return `${first}${second}`;
}

/** Diz se o valor é um CNPJ válido, numérico ou alfanumérico. */
export function isValid(value: unknown, options: ValidateOptions = {}): boolean {
  if (typeof value !== "string") return false;
  if (options.strict && !RAW.test(value) && !MASKED.test(value)) return false;

  const clean = strip(value);
  if (!RAW.test(clean)) return false;
  if (/^(.)\1{13}$/.test(clean)) return false;
  return checkDigits(clean.slice(0, 12)) === clean.slice(12);
}

/** Diz se o CNPJ tem ao menos uma letra (formato novo). Não valida. */
export function isAlphanumeric(value: unknown): boolean {
  return /[A-Z]/.test(strip(value));
}

/**
 * Aplica a máscara `AA.AAA.AAA/AAAA-DD`. Não valida os dígitos verificadores.
 * Lança `TypeError` se o valor não tiver as 14 posições.
 */
export function format(value: string): string {
  const clean = strip(value);
  if (!RAW.test(clean)) {
    throw new TypeError("O CNPJ precisa ter 14 posições para ser formatado");
  }
  return mask(clean);
}

/**
 * Máscara progressiva para campo de formulário: formata o que já foi digitado,
 * descarta caracteres inválidos e não deixa letra entrar nos dígitos verificadores.
 */
export function mask(value: string): string {
  let clean = "";
  for (const char of String(value).toUpperCase()) {
    if (clean.length === 14) break;
    const accepted = clean.length < 12 ? /[0-9A-Z]/ : /[0-9]/;
    if (accepted.test(char)) clean += char;
  }

  let out = clean.slice(0, 2);
  if (clean.length > 2) out += `.${clean.slice(2, 5)}`;
  if (clean.length > 5) out += `.${clean.slice(5, 8)}`;
  if (clean.length > 8) out += `/${clean.slice(8, 12)}`;
  if (clean.length > 12) out += `-${clean.slice(12)}`;
  return out;
}

/**
 * Gera um CNPJ válido para testes e seeds (raiz aleatória, estabelecimento `0001`).
 * Não corresponde a nenhuma empresa de propósito; pode coincidir com uma real por acaso.
 */
export function generate(options: GenerateOptions = {}): string {
  const random = options.random ?? Math.random;
  const size = options.numeric ? 10 : ALPHABET.length;

  let base = "";
  for (let i = 0; i < 8; i++) {
    base += ALPHABET[Math.floor(random() * size) % size];
  }
  base += "0001";

  const cnpj = base + checkDigits(base);
  return options.formatted ? mask(cnpj) : cnpj;
}
