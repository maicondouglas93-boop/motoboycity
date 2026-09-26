import type { EventoDoCliente, EventoDoLojista } from '@motoboycity/types';

export type { EventoDoCliente, EventoDoLojista };

/*
 * Qual evento cada etapa dispara e o texto dele moram em `@motoboycity/validation`
 * (`store-notification.rules.ts`): o servidor manda o push com as mesmas
 * palavras que esta tela mostra. Reexportados aqui com o caminho de sempre.
 */
export {
  EVENTOS_DO_CLIENTE_OBRIGATORIOS,
  avisoParaOCliente,
  eventoDoCliente,
} from '@motoboycity/validation';

/**
 * Os avisos da loja online: o que o lojista recebe, o que o cliente recebe e o
 * texto de cada um.
 *
 * Aqui, o catálogo das telas. Como o aviso chega — som, notificação do
 * navegador, push de servidor — é de quem o entrega (`avisos-do-navegador.ts`
 * no navegador; `store-order-notifications.service.ts`, na API).
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
