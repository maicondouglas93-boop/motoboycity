/**
 * As regras moram em `@motoboycity/validation` (`store-order.rules.ts`), e não aqui:
 * o servidor confere cada pedido com as mesmas contas que a tela mostra.
 * Este arquivo só as reexporta com o caminho que o painel já usa.
 */
export {
  acaoParaAvancar,
  avancar,
  caminhoDoPedido,
  chamarMotoboyCity,
  concluido,
  corridaParaALoja,
  esperandoAHora,
  etapaParaALoja,
  etapaParaOCliente,
  inicioDoPedido,
  inicioDoPreparo,
  MOTIVO_DO_PRAZO,
  nomeCurtoDaEtapa,
  pelaCorrida,
  podeCancelar,
  podeChamarMotoboyCity,
  prazoDoAceite,
  previsaoParaOCliente,
  prontoEm,
  proximaEtapa,
  quandoChegou,
  segueACorrida,
  TransicaoInvalida,
  vemDoMotoboy,
} from '@motoboycity/validation';
export type {
  AndamentoDoPedido,
  AutorDoCancelamento,
  Cancelamento,
  EtapaDoPedido,
  JanelaAgendada,
  Modalidade,
  ModoDeAceite,
  PassoDoPedido,
  QuemEntrega,
} from '@motoboycity/types';
