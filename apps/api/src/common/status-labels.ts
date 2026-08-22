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

export type DeliveryOfferResponse = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export const offerResponseLabel: Record<DeliveryOfferResponse, string> = {
  PENDING: 'aguardando resposta',
  ACCEPTED: 'aceita',
  DECLINED: 'recusada',
  EXPIRED: 'expirada',
};
