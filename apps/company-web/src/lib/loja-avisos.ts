import type { EventoDoCliente, EventoDoLojista } from '@motoboycity/types';
import type { EtapaDoPedido, Modalidade } from './loja-pedido';

export type { EventoDoCliente, EventoDoLojista };

/**
 * Os avisos da loja online: o que o lojista recebe, o que o cliente recebe e o
 * texto de cada um.
 *
 * Só o catálogo e as palavras. Como o aviso chega — som, notificação do
 * navegador, push de servidor — é de quem o entrega (`avisos-do-navegador.ts`,
 * e na integração o servidor de push).
 */

export interface DescricaoDoEvento<T extends string> {
  valor: T;
  titulo: string;
  detalhe: string;
}

export const EVENTOS_DO_LOJISTA: DescricaoDoEvento<EventoDoLojista>[] = [
  {
    valor: 'NOVO_PEDIDO',
    titulo: 'Novo pedido',
    detalhe: 'Cada pedido que chega pela página da loja.',
  },
  {
    valor: 'PEDIDO_CANCELADO',
    titulo: 'Pedido cancelado',
    detalhe: 'Quando o cliente ou o sistema cancela. O que você mesmo cancela não avisa.',
  },
  {
    valor: 'PEDIDO_AGENDADO',
    titulo: 'Pedido agendado',
    detalhe: 'Quando alguém agenda, e de novo quando chega a hora de começar a preparar.',
  },
  {
    valor: 'PAGAMENTO_RECEBIDO',
    titulo: 'Pagamento recebido',
    detalhe: 'Quando o Asaas confirma um pagamento online.',
  },
  {
    valor: 'LOJA_FECHANDO',
    titulo: 'Loja fechando',
    detalhe: 'Alguns minutos antes do fim do horário — dá tempo de ficar aberta mais um pouco.',
  },
];

/**
 * "Pronto para retirar" entrou além da lista pedida: na retirada é o aviso que
 * mais importa — é ele que faz o cliente sair de casa. "Saiu para entrega" não
 * existe na retirada, e sem este o cliente ficaria sem aviso nenhum entre o
 * preparo e o balcão.
 */
export const EVENTOS_DO_CLIENTE: DescricaoDoEvento<EventoDoCliente>[] = [
  {
    valor: 'RECEBIDO',
    titulo: 'Pedido recebido',
    detalhe: 'Assim que o pedido chega à loja.',
  },
  {
    valor: 'ACEITO',
    titulo: 'Pedido aceito',
    detalhe: 'Quando a loja confirma. No aceite automático, junto com o recebido.',
  },
  {
    valor: 'EM_PREPARO',
    titulo: 'Em preparação',
    detalhe: 'Quando a cozinha começa.',
  },
  {
    valor: 'PRONTO_PARA_RETIRAR',
    titulo: 'Pronto para retirar',
    detalhe: 'Só na retirada: é o aviso que faz o cliente sair de casa.',
  },
  {
    valor: 'SAIU_PARA_ENTREGA',
    titulo: 'Saiu para entrega',
    detalhe: 'Quando o motoboy coleta o pedido na loja.',
  },
  {
    valor: 'ENTREGUE',
    titulo: 'Entregue',
    detalhe: 'Quando o motoboy confirma a entrega, ou o cliente retira.',
  },
  {
    valor: 'CANCELADO',
    titulo: 'Cancelado',
    detalhe: 'Sempre avisado: quem pagou online precisa saber na hora.',
  },
];

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
