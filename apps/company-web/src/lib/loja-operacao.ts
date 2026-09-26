/**
 * As regras moram em `@motoboycity/validation` (`store-operation.rules.ts`), e não aqui:
 * o servidor confere cada pedido com as mesmas contas que a tela mostra.
 * Este arquivo só as reexporta com o caminho que o painel já usa.
 */
export {
  agendamentoLigado,
  FOLGA_DA_ENTREGA_MIN,
  horariosDaModalidade,
  minutosAntesDoHorario,
  modalidadesAtivas,
  pedidoMinimoDa,
  textoDoTempo,
} from '@motoboycity/validation';
export type {
  EnderecoDeRetirada,
  NotificacaoDoLojista,
  OperacaoDaLoja,
  OperacaoPublica,
} from '@motoboycity/types';
