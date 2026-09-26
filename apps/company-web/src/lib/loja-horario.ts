/**
 * As regras moram em `@motoboycity/validation` (`store-schedule.rules.ts`), e não aqui:
 * o servidor confere cada pedido com as mesmas contas que a tela mostra.
 * Este arquivo só as reexporta com o caminho que o painel já usa.
 */
export {
  ajusteVigente,
  dataCurta,
  dataValida,
  diaDaSemana,
  DIAS_DA_SEMANA,
  diasEntre,
  domingoDePascoa,
  duracaoDaFaixa,
  emMinutos,
  excecaoDaData,
  faixasDaData,
  faixaValida,
  feriadosNacionais,
  FUSO_DA_LOJA,
  hora,
  horariosParaAgendar,
  instanteNaLoja,
  momentoNaLoja,
  noDia,
  observacaoDaFaixa,
  ORDEM_DA_SEMANA,
  passaDaMeiaNoite,
  problemasDoHorario,
  proximaAberturaDoHorario,
  proximosFeriados,
  relogioValido,
  rotuloDoDia,
  situacaoDaLoja,
  somarDias,
} from '@motoboycity/validation';
export type {
  DiaParaAgendar,
  Feriado,
  MotivoDaSituacao,
  ProblemaDoHorario,
  SituacaoDaLoja,
} from '@motoboycity/validation';
export type {
  AjusteManual,
  DiaDeFuncionamento,
  EstadoManual,
  ExcecaoDeData,
  FaixaDeHorario,
  Funcionamento,
  RegrasDoAgendamento,
  Relogio,
  TipoDeExcecao,
} from '@motoboycity/types';
