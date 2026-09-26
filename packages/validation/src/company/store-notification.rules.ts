import type {
  EtapaDoPedido,
  EventoDoCliente,
  EventoDoLojista,
  Modalidade,
} from '@motoboycity/types';

/**
 * Os avisos da loja online: qual evento cada etapa dispara e o texto dele.
 *
 * Regras puras, neste pacote pelo mesmo motivo das do pedido: o servidor manda
 * o push com estas palavras, e o painel mostra a prévia com as mesmas. O
 * catálogo das telas (título e explicação de cada chave) continua no painel,
 * em `lib/loja-avisos.ts`.
 */

/**
 * O cancelamento não pode ser desligado. Quem pagou por Pix e não recebe nada
 * precisa saber que o pedido não vem — descobrir pela demora é o pior jeito.
 */
export const EVENTOS_DO_CLIENTE_OBRIGATORIOS: EventoDoCliente[] = ['CANCELADO'];

/** Qual aviso a etapa dispara para o cliente, se algum. */
export function eventoDoCliente(
  modalidade: Modalidade,
  etapa: EtapaDoPedido,
): EventoDoCliente | null {
  switch (etapa) {
    case 'NOVO':
      return 'RECEBIDO';
    case 'ACEITO':
      return 'ACEITO';
    case 'EM_PREPARO':
      return 'EM_PREPARO';
    case 'PRONTO':
      // Na entrega, "pronto" é assunto da loja com o motoboy: o próximo aviso
      // que interessa ao cliente é a saída.
      return modalidade === 'RETIRADA' ? 'PRONTO_PARA_RETIRAR' : null;
    case 'SAIU_PARA_ENTREGA':
      return 'SAIU_PARA_ENTREGA';
    case 'ENTREGUE':
      return 'ENTREGUE';
    case 'CANCELADO':
      return 'CANCELADO';
  }
}

/** O texto que o cliente lê na notificação. */
export function avisoParaOCliente(
  evento: EventoDoCliente,
  numero: number,
  modalidade: Modalidade,
  motivo?: string | null,
): string {
  switch (evento) {
    case 'RECEBIDO':
      return `Recebemos seu pedido #${numero}.`;
    case 'ACEITO':
      return `Seu pedido #${numero} foi aceito.`;
    case 'EM_PREPARO':
      return `Seu pedido #${numero} está sendo preparado.`;
    case 'PRONTO_PARA_RETIRAR':
      return `Seu pedido #${numero} está pronto. Já pode vir buscar.`;
    case 'SAIU_PARA_ENTREGA':
      return `Seu pedido #${numero} saiu para entrega.`;
    case 'ENTREGUE':
      return modalidade === 'ENTREGA'
        ? `Seu pedido #${numero} foi entregue.`
        : `Pedido #${numero} retirado. Obrigado!`;
    case 'CANCELADO':
      return motivo?.trim()
        ? `Seu pedido #${numero} foi cancelado: ${motivo.trim()}.`
        : `Seu pedido #${numero} foi cancelado.`;
  }
}

/** O título da notificação da loja — o mesmo que Notificações mostra. */
export const TITULO_DO_AVISO_DO_LOJISTA: Record<EventoDoLojista, string> = {
  NOVO_PEDIDO: 'Novo pedido',
  PEDIDO_CANCELADO: 'Pedido cancelado',
  PEDIDO_AGENDADO: 'Pedido agendado',
  PAGAMENTO_RECEBIDO: 'Pagamento recebido',
  LOJA_FECHANDO: 'Loja fechando',
};
