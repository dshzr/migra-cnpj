# migra-cnpj

Ferramentas para o **CNPJ alfanumérico** em TypeScript: validação, formatação, máscara de input, geração para testes e um **scanner que aponta o que quebra no seu código** com o novo formato.

- Zero dependências, ESM + CommonJS, tipos inclusos.
- Aceita os dois formatos: o numérico antigo e o alfanumérico.
- Adapter para Zod em `migra-cnpj/zod`.
- CLI: `npx migra-cnpj scan`.

## O que mudou no CNPJ

Desde julho de 2026 a Receita Federal emite CNPJs com letras. O número continua com 14 posições e a mesma máscara, mas as 12 primeiras aceitam `0-9` e `A-Z`. Os 2 dígitos verificadores (DV) seguem numéricos. CNPJs já existentes não mudam, então os dois formatos convivem.

O DV continua no módulo 11. A diferença é que cada caractere entra na conta como `código ASCII − 48` (`0`→0 … `9`→9, `A`→17 … `Z`→42). O exemplo oficial da Receita é `12.ABC.345/01DE-35`.

Na prática, quebra todo código que trata CNPJ como número: regex `\d{14}`, `replace(/\D/g, "")`, `parseInt`, colunas `BIGINT`, teclado numérico no formulário. É isso que o scanner procura.

## Instalação

```bash
npm install migra-cnpj
```

## Uso

```ts
import { isValid, format, strip, mask, generate, checkDigits, isAlphanumeric } from "migra-cnpj";

isValid("12.ABC.345/01DE-35"); // true
isValid("11.222.333/0001-81"); // true (formato antigo segue válido)
isValid("12ABC34501DE36"); // false (DV errado)

strip("12.abc.345/01de-35"); // "12ABC34501DE35"
format("12abc34501de35"); // "12.ABC.345/01DE-35"
checkDigits("12ABC34501DE"); // "35"
isAlphanumeric("12ABC34501DE35"); // true

generate(); // "K7QX2M9P000146" — válido, para testes e seeds
generate({ numeric: true, formatted: true }); // "48.210.937/0001-52"
```

| Função | O que faz |
| --- | --- |
| `isValid(valor, { strict? })` | Valida tamanho, caracteres e DV. Tolera máscara, espaços e minúsculas; com `strict: true` exige maiúsculas e máscara completa ou nenhuma. |
| `strip(valor)` | Remove `.`, `/`, `-` e espaços e converte para maiúsculas. Use antes de gravar no banco. |
| `format(valor)` | Aplica a máscara. Lança `TypeError` se não houver 14 posições. |
| `mask(valor)` | Máscara progressiva para campo de formulário (veja abaixo). |
| `checkDigits(base)` | Calcula os 2 DVs das 12 primeiras posições. |
| `isAlphanumeric(valor)` | Diz se o CNPJ tem letra. |
| `generate({ numeric?, formatted?, random? })` | Gera um CNPJ válido. Passe `random` para resultados reproduzíveis. |

### Máscara de input

`mask` formata o que já foi digitado, descarta caracteres inválidos e não deixa letra entrar nos dígitos verificadores:

```tsx
<input
  value={cnpj}
  onChange={(e) => setCnpj(mask(e.target.value))}
  inputMode="text"
  autoCapitalize="characters"
  maxLength={18}
/>
```

### Zod

```ts
import { z } from "zod";
import { cnpj } from "migra-cnpj/zod";

const Empresa = z.object({
  nome: z.string(),
  cnpj: cnpj(), // devolve "12ABC34501DE35"
});

cnpj({ output: "formatted", message: "CNPJ inválido", strict: false });
```

Funciona com Zod 3 e 4. O Zod é uma dependência opcional: só é necessário se você importar `migra-cnpj/zod`.

## Scanner de migração

Varre um repositório e lista os trechos que deixam de funcionar com CNPJ alfanumérico. Funciona em qualquer linguagem, porque procura padrões de texto.

```bash
npx migra-cnpj scan
```

```
src/empresa.ts
  1:42  tipo-numerico  CNPJ guardado em tipo numérico. Mude para texto de 14 posições (CHAR(14) / string).
      export interface Empresa { nome: string; cnpj: number }
  2:61  limpeza-remove-letras  Limpeza remove tudo que não é dígito e apaga as letras do CNPJ. Remova só a pontuação (. / -).
      export function limpar(cnpj: string) { return cnpj.replace(/\D/g, ""); }

2 ponto(s) a ajustar em 1 de 14 arquivo(s)
```

| Regra | O que encontra |
| --- | --- |
| `regex-so-digitos` | `\d{14}`, `[0-9]{14}` e regex da máscara só com dígitos |
| `limpeza-remove-letras` | `replace(/\D/g, "")`, `[^0-9]`, `[^\d]` em linha que fala de CNPJ |
| `conversao-numerica` | `parseInt`, `Number`, `int()`, `intval`, `Long.parseLong`, `.to_i` em CNPJ |
| `checagem-so-digitos` | `isdigit`, `is_numeric`, `ctype_digit`, `isNaN` em CNPJ |
| `tipo-numerico` | coluna `BIGINT`/`NUMERIC`, `cnpj: number`, `Long cnpj`, `bigInteger('cnpj')` |
| `campo-so-numerico` | `inputmode="numeric"`, `type="number"`, `keyboardType="numeric"` perto de CNPJ |
| `mascara-so-digitos` | máscaras fixas `99.999.999/9999-99`, `00.000.000/0000-00` |

Opções: `--json` para saída em JSON e `--ignore a,b` para pular pastas ou arquivos. O comando sai com código 1 quando há achados, então serve de trava no CI. Para silenciar uma linha, adicione o comentário `migra-cnpj-ignore` nela ou na linha de cima.

O scanner trabalha por padrões de texto, sem interpretar o código. Ele pode apontar um trecho que na verdade está certo e pode deixar passar um problema escrito de um jeito incomum. Use como lista de revisão, não como garantia.

Também dá para usar por código:

```ts
import { scanDirectory, scanText } from "migra-cnpj/scanner";

const { findings, filesScanned } = await scanDirectory("./src", { ignore: ["legacy"] });
```

### Outros comandos

```bash
npx migra-cnpj validate 12.ABC.345/01DE-35
npx migra-cnpj format 12abc34501de35
npx migra-cnpj generate -n 5 --formatted
```

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Referência

[Perguntas e respostas da Receita Federal sobre o CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf)

## Licença

MIT
