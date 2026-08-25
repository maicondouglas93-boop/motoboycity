import type { DeliveryStatus } from '@prisma/client';

/**
 * Rótulos em português para os valores de enum que chegam na tela.
 *
 * O produto inteiro é operado em português por gente que não lê código, e uma
 * linha de auditoria dizendo "Pedido #1163: CANCELLED." não comunica nada a
 * quem precisa dela. Os rótulos vivem no servidor porque é lá que a frase é
 * montada — traduzir no painel exigiria devolver o enum junto com o texto e
 * remontar a frase do outro lado.
 *
 * A redação é de EVENTO, no particípio, e não de estado: a linha do tempo diz
 * o que aconteceu naquele instante, enquanto o chip da fila diz onde o pedido
 * está agora. "Voltando à loja" é um bom chip e uma péssima entrada de log.
 */
export const deliveryStatusEventLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'agendado',
  AWAITING_DRIVER: 'buscando motoboy',
  ACCEPTED: 'aceito por um motoboy',
  COLLECTED: 'coletado',
  DELIVERED: 'entregue',
  FAILED: 'não entregue',
  COMPLETED: 'concluído',
  CANCELLED: 'cancelado',
  AWAITING_PAYMENT: 'aguardando pagamento',
};

interface DeliveryActivityMessageInput {
  displayNumber: number;
  companyName?: string | null;
  status: DeliveryStatus;
  driverName?: string | null;
}

/**
 * Frase completa usada no feed auditavel do Admin.
 *
 * Empresa e motoboy fazem parte da frase, em vez de aparecerem apenas como
 * links soltos abaixo dela. O nome do motoboy entra somente nos estados em que
 * ele efetivamente participa da operacao; em cancelamentos, por exemplo, o
 * autor pode ser empresa, admin ou motoboy, entao nao atribuimos a acao a ele.
 */
export function deliveryActivityMessage({
  displayNumber,
  companyName,
  status,
  driverName,
}: DeliveryActivityMessageInput): string {
  const order = `Pedido #${displayNumber}${companyName ? ` da empresa ${companyName}` : ''}`;
  const byDriver = driverName ? ` por ${driverName}` : '';

  switch (status) {
    case 'SCHEDULED':
      return `${order} foi agendado.`;
    case 'AWAITING_DRIVER':
      return `${order} está buscando motoboy.`;
    case 'ACCEPTED':
      return `${order} foi aceito${byDriver || ' por um motoboy'}.`;
    case 'COLLECTED':
      return `${order} foi coletado${byDriver}.`;
    case 'DELIVERED':
      return `${order} foi entregue${byDriver}.`;
    case 'FAILED':
      return `${order} não foi entregue${byDriver} e está retornando à loja.`;
    case 'COMPLETED':
      return `${order} foi concluído${byDriver}.`;
    case 'CANCELLED':
      return `${order} foi cancelado.`;
    case 'AWAITING_PAYMENT':
      return `${order} está aguardando pagamento.`;
  }
}

export type DeliveryOfferResponse = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export const offerResponseLabel: Record<DeliveryOfferResponse, string> = {
  PENDING: 'aguardando resposta',
  ACCEPTED: 'aceita',
  DECLINED: 'recusada',
  EXPIRED: 'expirada',
};

interface OfferActivityMessageInput {
  displayNumber: number;
  companyName?: string | null;
  response: DeliveryOfferResponse;
  driverName?: string | null;
}

export function offerActivityMessage({
  displayNumber,
  companyName,
  response,
  driverName,
}: OfferActivityMessageInput): string {
  const offer = `Oferta do pedido #${displayNumber}${
    companyName ? ` da empresa ${companyName}` : ''
  }`;
  const driver = driverName ?? 'um motoboy';

  switch (response) {
    case 'PENDING':
      return `${offer} foi enviada para ${driver}.`;
    case 'ACCEPTED':
      return `${offer} foi aceita por ${driver}.`;
    case 'DECLINED':
      return `${offer} foi recusada por ${driver}.`;
    case 'EXPIRED':
      return `${offer} expirou para ${driver}.`;
  }
}
