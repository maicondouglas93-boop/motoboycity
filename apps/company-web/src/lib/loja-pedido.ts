import { hora, momentoNaLoja, rotuloDoDia } from './loja-horario';

/**
 * O caminho de um pedido da loja online, do "recebido" ao "entregue".
 *
 * Regras puras, como as de `loja-horario.ts`, e pelo mesmo motivo fora do
 * `loja-mock.ts`: o servidor vai precisar delas para conferir cada mudança de
 * etapa antes de gravar.
 *
 * O pedido NÃO é a entrega. O pedido é o que a loja vendeu; a entrega é a
 * corrida do motoboy, com o `DeliveryStatus` dela. As etapas até "Pronto" são
 * da cozinha. Quando o MOTOboyCity entrega, "Saiu para entrega" e "Entregue"
 * vêm da corrida (`COLLECTED` e `DELIVERED`) — quem as marca é o aplicativo do
 * motoboy, e não a loja. Com entregador próprio não há corrida, e a loja marca
 * as duas. Retirada não tem corrida nenhuma: vai de "Pronto" a "Retirado".
 */

export type Modalidade = 'ENTREGA' | 'RETIRADA';

/**
 * Automático: o pedido entra aceito e vai para a fila da cozinha sozinho.
 * Manual: cada pedido espera alguém da loja aceitar.
 */
export type ModoDeAceite = 'AUTOMATICO' | 'MANUAL';

/**
 * Quem leva o pedido de entrega até o cliente. A escolha é da empresa: há
 * quem use a loja com motoboy próprio, e o pedido dela não pode cair na lista
 * de corridas do MOTOboyCity (decisão 15 do plano da loja).
 *
 * `MOTOBOYCITY`: o pedido pronto vira corrida, e a saída e a entrega chegam do
 * aplicativo do motoboy. `LOJA`: o entregador é da loja, nada passa pelo
 * MOTOboyCity, e é a loja que marca a saída e a entrega.
 */
export type QuemEntrega = 'MOTOBOYCITY' | 'LOJA';

export type EtapaDoPedido =
  'NOVO' | 'ACEITO' | 'EM_PREPARO' | 'PRONTO' | 'SAIU_PARA_ENTREGA' | 'ENTREGUE' | 'CANCELADO';

export interface PassoDoPedido {
  etapa: EtapaDoPedido;
  /** ISO. */
  em: string;
}

/**
 * Quem cancelou. Importa para o aviso: a loja não precisa ser avisada do que
 * ela mesma cancelou, mas precisa saber quando foi o cliente ou o sistema.
 */
export type AutorDoCancelamento = 'LOJA' | 'CLIENTE' | 'SISTEMA';

export interface Cancelamento {
  motivo: string;
  por: AutorDoCancelamento;
}

/** A janela que o cliente escolheu ao agendar. ISO nas duas pontas. */
export interface JanelaAgendada {
  inicio: string;
  fim: string;
}

/** O que o caminho do pedido precisa saber — o resto do pedido não entra aqui. */
export interface AndamentoDoPedido {
  numero: number;
  modalidade: Modalidade;
  etapa: EtapaDoPedido;
  historico: PassoDoPedido[];
  /** `null`: o quanto antes. */
  janela: JanelaAgendada | null;
  /** Congelados no aceite: mudar o padrão depois não muda a promessa já feita. */
  minutosDePreparo: number;
  minutosDeEntrega: number;
  cancelamento: Cancelamento | null;
  /**
   * Na entrega, quem leva — congelado no pedido pelo mesmo motivo dos tempos:
   * mudar a configuração não troca quem já está levando. `null` na retirada.
   */
  entregaPor: QuemEntrega | null;
}

const CAMINHOS: Record<Modalidade, EtapaDoPedido[]> = {
  ENTREGA: ['NOVO', 'ACEITO', 'EM_PREPARO', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE'],
  RETIRADA: ['NOVO', 'ACEITO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE'],
};

export function caminhoDoPedido(modalidade: Modalidade): EtapaDoPedido[] {
  return CAMINHOS[modalidade];
}

export function proximaEtapa(modalidade: Modalidade, etapa: EtapaDoPedido): EtapaDoPedido | null {
  const caminho = CAMINHOS[modalidade];
  const indice = caminho.indexOf(etapa);
  if (indice === -1) return null;
  return caminho[indice + 1] ?? null;
}

export function concluido(etapa: EtapaDoPedido): boolean {
  return etapa === 'ENTREGUE' || etapa === 'CANCELADO';
}

/**
 * O pedido é levado pelo entregador da própria loja. Pedidos gravados antes
 * de existir a escolha não têm o campo, e contam como MOTOboyCity — o que
 * valia para todos até então.
 */
function levaALoja(modalidade: Modalidade, entregaPor: QuemEntrega | null | undefined): boolean {
  return modalidade === 'ENTREGA' && entregaPor === 'LOJA';
}

/**
 * Até quando a loja cancela sozinha.
 *
 * Pelo MOTOboyCity, até o pedido ficar pronto: dali em diante o motoboy já foi
 * chamado, pode estar a caminho, e cancelar passa a ser com a central. Sem
 * corrida — na retirada, ou com o entregador da loja —, a loja cancela até o
 * pedido sair das mãos dela: o cliente buscar, ou o entregador sair.
 */
export function podeCancelar(
  modalidade: Modalidade,
  etapa: EtapaDoPedido,
  entregaPor: QuemEntrega | null = null,
): boolean {
  if (etapa === 'NOVO' || etapa === 'ACEITO' || etapa === 'EM_PREPARO') return true;
  return etapa === 'PRONTO' && (modalidade === 'RETIRADA' || levaALoja(modalidade, entregaPor));
}

/**
 * Quem entrega com motoboy próprio pode passar UM pedido para o MOTOboyCity —
 * o dia em que o entregador faltou, ou em que a fila apertou. Vale depois do
 * aceite e até o pedido sair; o pedido passa a seguir o caminho da corrida.
 */
export function podeChamarMotoboyCity(pedido: AndamentoDoPedido): boolean {
  return (
    levaALoja(pedido.modalidade, pedido.entregaPor) &&
    (pedido.etapa === 'ACEITO' || pedido.etapa === 'EM_PREPARO' || pedido.etapa === 'PRONTO')
  );
}

/** O pedido passado para o MOTOboyCity. Fora do caso de `podeChamarMotoboyCity`, fica como está. */
export function chamarMotoboyCity<T extends AndamentoDoPedido>(pedido: T): T {
  return podeChamarMotoboyCity(pedido) ? { ...pedido, entregaPor: 'MOTOBOYCITY' } : pedido;
}

export class TransicaoInvalida extends Error {
  constructor(de: EtapaDoPedido, para: EtapaDoPedido) {
    super(`O pedido não pode ir de ${de} para ${para}.`);
    this.name = 'TransicaoInvalida';
  }
}

/**
 * Leva o pedido à etapa `para`, registrando a hora no histórico.
 *
 * Só anda para a frente, uma etapa por vez — pular de "Novo" para "Pronto"
 * deixaria o cliente sem saber que o pedido foi aceito. Pedir a etapa em que o
 * pedido já está devolve o próprio pedido: dois toques no mesmo botão, ou duas
 * abas abertas, não são erro.
 */
export function avancar<T extends AndamentoDoPedido>(
  pedido: T,
  para: EtapaDoPedido,
  agora: Date,
  cancelamento?: Cancelamento,
): T {
  if (pedido.etapa === para) return pedido;

  const passo: PassoDoPedido = { etapa: para, em: agora.toISOString() };

  if (para === 'CANCELADO') {
    if (!podeCancelar(pedido.modalidade, pedido.etapa, pedido.entregaPor)) {
      throw new TransicaoInvalida(pedido.etapa, para);
    }
    return {
      ...pedido,
      etapa: para,
      historico: [...pedido.historico, passo],
      cancelamento: cancelamento ?? { motivo: '', por: 'LOJA' },
    };
  }

  if (proximaEtapa(pedido.modalidade, pedido.etapa) !== para) {
    throw new TransicaoInvalida(pedido.etapa, para);
  }
  return { ...pedido, etapa: para, historico: [...pedido.historico, passo] };
}

/**
 * Onde o pedido começa. No aceite automático ele nasce aceito, mas o histórico
 * guarda as duas marcas — o "recebido" existe mesmo quando dura zero segundo.
 */
export function inicioDoPedido(
  modo: ModoDeAceite,
  agora: Date,
): { etapa: EtapaDoPedido; historico: PassoDoPedido[] } {
  const em = agora.toISOString();
  if (modo === 'AUTOMATICO') {
    return {
      etapa: 'ACEITO',
      historico: [
        { etapa: 'NOVO', em },
        { etapa: 'ACEITO', em },
      ],
    };
  }
  return { etapa: 'NOVO', historico: [{ etapa: 'NOVO', em }] };
}

/** Quando o pedido chegou a uma etapa, ou `null` se não chegou. */
export function quandoChegou(pedido: AndamentoDoPedido, etapa: EtapaDoPedido): Date | null {
  const passo = pedido.historico.find((item) => item.etapa === etapa);
  return passo ? new Date(passo.em) : null;
}

/**
 * Quando a cozinha precisa começar um pedido agendado: a janela escolhida,
 * menos o preparo e, na entrega, menos o caminho.
 */
export function inicioDoPreparo(pedido: AndamentoDoPedido): Date | null {
  if (!pedido.janela) return null;
  const antes =
    pedido.minutosDePreparo + (pedido.modalidade === 'ENTREGA' ? pedido.minutosDeEntrega : 0);
  return new Date(new Date(pedido.janela.inicio).getTime() - antes * 60_000);
}

/**
 * Agendado, aceito e ainda longe da hora de começar.
 *
 * É o que o painel tira da fila de agora: um pedido para amanhã no meio dos
 * pedidos da noite faria a cozinha começar a coisa errada. Novo continua na
 * fila mesmo agendado — ele precisa de alguém aceitar hoje, para o cliente
 * saber que está garantido.
 */
export function esperandoAHora(pedido: AndamentoDoPedido, agora: Date): boolean {
  const inicio = inicioDoPreparo(pedido);
  return inicio !== null && pedido.etapa === 'ACEITO' && agora.getTime() < inicio.getTime();
}

/** O motivo que o cliente lê quando o pedido cai por falta de aceite. */
export const MOTIVO_DO_PRAZO = 'A loja não confirmou a tempo';

/**
 * Até quando a loja pode aceitar um pedido novo antes de ele ser cancelado
 * sozinho. `null`: não há prazo — a loja escolheu não cancelar, ou o pedido já
 * não está esperando aceite.
 *
 * Para agora, conta do recebimento: o cliente está com fome e esperando uma
 * resposta. Agendado, espera até a hora de a cozinha começar — o pedido feito à
 * noite para o almoço de amanhã não pode cair às 22h10 só porque ninguém estava
 * no painel; ele só vira problema quando a comida já devia estar sendo feita.
 */
export function prazoDoAceite(pedido: AndamentoDoPedido, prazoMin: number | null): Date | null {
  if (prazoMin === null || pedido.etapa !== 'NOVO') return null;
  const inicio = inicioDoPreparo(pedido);
  if (inicio) return inicio;
  const recebido = quandoChegou(pedido, 'NOVO');
  return recebido ? new Date(recebido.getTime() + prazoMin * 60_000) : null;
}

/* ---------------------------------------------------------------------------
 * Como cada lado chama cada etapa
 * ------------------------------------------------------------------------- */

/** Como a etapa aparece no painel. */
export function etapaParaALoja(etapa: EtapaDoPedido, modalidade: Modalidade): string {
  switch (etapa) {
    case 'NOVO':
      return 'Novo';
    case 'ACEITO':
      return 'Aceito';
    case 'EM_PREPARO':
      return 'Em preparação';
    case 'PRONTO':
      return modalidade === 'ENTREGA' ? 'Pronto · esperando o motoboy' : 'Pronto para retirar';
    case 'SAIU_PARA_ENTREGA':
      return 'Saiu para entrega';
    case 'ENTREGUE':
      return modalidade === 'ENTREGA' ? 'Entregue' : 'Retirado';
    case 'CANCELADO':
      return 'Cancelado';
  }
}

/**
 * Como a etapa aparece para o cliente. "Novo" vira "esperando a loja
 * confirmar": para quem pediu, o pedido não é novo — é um pedido que ainda não
 * tem resposta.
 */
export function etapaParaOCliente(etapa: EtapaDoPedido, modalidade: Modalidade): string {
  switch (etapa) {
    case 'NOVO':
      return 'Esperando a loja confirmar';
    case 'ACEITO':
      return 'Pedido aceito';
    case 'EM_PREPARO':
      return 'Em preparação';
    case 'PRONTO':
      return modalidade === 'ENTREGA' ? 'Pronto, esperando o motoboy' : 'Pronto para retirar';
    case 'SAIU_PARA_ENTREGA':
      return 'Saiu para entrega';
    case 'ENTREGUE':
      return modalidade === 'ENTREGA' ? 'Entregue' : 'Retirado';
    case 'CANCELADO':
      return 'Cancelado';
  }
}

/** O nome curto, para a régua de progresso. */
export function nomeCurtoDaEtapa(etapa: EtapaDoPedido, modalidade: Modalidade): string {
  switch (etapa) {
    case 'NOVO':
      return 'Recebido';
    case 'ACEITO':
      return 'Aceito';
    case 'EM_PREPARO':
      return 'Preparo';
    case 'PRONTO':
      return 'Pronto';
    case 'SAIU_PARA_ENTREGA':
      return 'A caminho';
    case 'ENTREGUE':
      return modalidade === 'ENTREGA' ? 'Entregue' : 'Retirado';
    case 'CANCELADO':
      return 'Cancelado';
  }
}

/** O botão que leva à próxima etapa, dito como a ação que a pessoa faz. */
export function acaoParaAvancar(
  modalidade: Modalidade,
  etapa: EtapaDoPedido,
  entregaPor: QuemEntrega | null = null,
): string | null {
  switch (etapa) {
    case 'NOVO':
      return 'Aceitar';
    case 'ACEITO':
      return 'Começar o preparo';
    case 'EM_PREPARO':
      return 'Marcar como pronto';
    case 'PRONTO':
      if (modalidade === 'RETIRADA') return 'Cliente retirou';
      return levaALoja(modalidade, entregaPor) ? 'Saiu para entrega' : 'Motoboy coletou';
    case 'SAIU_PARA_ENTREGA':
      return 'Marcar como entregue';
    default:
      return null;
  }
}

/**
 * As etapas que, na integração, chegam do aplicativo do motoboy do MOTOboyCity
 * e não da loja. Com o entregador da loja, nenhuma: é ela quem marca.
 */
export function vemDoMotoboy(
  modalidade: Modalidade,
  etapa: EtapaDoPedido,
  entregaPor: QuemEntrega | null = null,
): boolean {
  return (
    modalidade === 'ENTREGA' &&
    !levaALoja(modalidade, entregaPor) &&
    (etapa === 'PRONTO' || etapa === 'SAIU_PARA_ENTREGA')
  );
}

/** "hoje", "amanhã", "sexta, 25/09". */
function diaDaJanela(inicio: Date, agora: Date): string {
  const data = momentoNaLoja(inicio).data;
  const rotulo = rotuloDoDia(data, agora);
  if (rotulo === 'hoje' || rotulo === 'amanhã' || rotulo.includes('/')) return rotulo;
  const [, mes, dia] = data.split('-');
  return `${rotulo}, ${dia}/${mes}`;
}

/**
 * A previsão que o cliente lê. Janela na entrega — o caminho varia — e hora
 * na retirada, porque ali a pergunta é "a partir de quando posso ir buscar?".
 *
 * Antes de a loja aceitar não há previsão: ela depende do preparo que a loja
 * vai confirmar, e prometer um horário que a loja ainda não viu seria inventar.
 */
export function previsaoParaOCliente(pedido: AndamentoDoPedido, agora: Date): string {
  if (pedido.etapa === 'CANCELADO') {
    const motivo = pedido.cancelamento?.motivo.trim();
    return motivo ? `Cancelado · ${motivo}` : 'Cancelado';
  }

  if (pedido.etapa === 'ENTREGUE') {
    const quando = quandoChegou(pedido, 'ENTREGUE');
    const verbo = pedido.modalidade === 'ENTREGA' ? 'Entregue' : 'Retirado';
    return quando ? `${verbo} às ${hora(quando)}` : verbo;
  }

  if (pedido.etapa === 'PRONTO' && pedido.modalidade === 'RETIRADA') return 'Já pode buscar';

  if (pedido.janela) {
    const inicio = new Date(pedido.janela.inicio);
    const fim = new Date(pedido.janela.fim);
    const dia = diaDaJanela(inicio, agora);
    return pedido.modalidade === 'ENTREGA'
      ? `Agendado para ${dia}, entre ${hora(inicio)} e ${hora(fim)}`
      : `Retirada agendada para ${dia}, a partir de ${hora(inicio)}`;
  }

  const aceito = quandoChegou(pedido, 'ACEITO');
  if (!aceito) return 'A previsão aparece quando a loja confirmar';

  const pronto = aceito.getTime() + pedido.minutosDePreparo * 60_000;
  if (pedido.modalidade === 'RETIRADA') {
    return `Pronto para retirar a partir de ${hora(new Date(pronto))}`;
  }
  const chega = pronto + pedido.minutosDeEntrega * 60_000;
  return `Chega entre ${hora(new Date(chega))} e ${hora(new Date(chega + 15 * 60_000))}`;
}
