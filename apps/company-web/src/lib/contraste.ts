/**
 * Contraste das cores escolhidas pela loja.
 *
 * A régua mora em `@motoboycity/validation` (`store-identity.schema.ts`), e não
 * aqui: o servidor recusa a cor que o painel avisa, e as duas pontas medem com
 * a mesma conta. Este arquivo só a reexporta com os nomes que as telas usam.
 */
export {
  MINIMO_PARA_BOTAO,
  MINIMO_PARA_TEXTO,
  contrasteComAPagina,
  fundoDoTema,
  lerHex,
  problemasDasCores,
  textoSobre,
  type TemaDaLoja,
} from '@motoboycity/validation';
