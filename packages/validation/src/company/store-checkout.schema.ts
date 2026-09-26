import { z } from 'zod';
import {
  FORMAS_DE_PAGAMENTO_NA_ENTREGA,
  FORMAS_DE_PAGAMENTO_ONLINE,
} from './store-operation.schema';

/**
 * O pedido que o cliente manda da página da loja.
 *
 * Nenhum preço vem daqui: o servidor calcula o subtotal, a taxa e o total com
 * o cardápio e os bairros que a loja gravou. Um preço vindo do navegador seria
 * um preço que o cliente escolhe — o `totalVisto` só serve para conferir.
 *
 * O item vem por id — produto, tamanho, escolhas —, e não por nome: nome muda,
 * e dois adicionais podem se chamar igual em grupos diferentes.
 */

const textoCurto = (maximo: number, mensagem: string) => z.string().trim().max(maximo, mensagem);

const itemSchema = z.object({
  produtoId: z.string().trim().min(1).max(40),
  tamanhoId: z.string().trim().min(1).max(40).nullable(),
  escolhas: z
    .array(z.string().trim().min(1).max(40))
    .max(60)
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma escolha apareceu duas vezes.'),
  quantidade: z
    .number()
    .int('A quantidade é um número inteiro.')
    .min(1, 'A quantidade mínima é 1.')
    .max(99, 'Use no máximo 99 de cada item.'),
});

const enderecoSchema = z.object({
  rua: z.string().trim().min(1, 'Informe a rua.').max(120, 'Use no máximo 120 caracteres.'),
  numero: z.string().trim().min(1, 'Informe o número.').max(20, 'Use no máximo 20 caracteres.'),
  complemento: textoCurto(60, 'Use no máximo 60 caracteres no complemento.').nullable(),
  /** O bairro da lista da loja: é dele que sai a taxa. */
  bairroId: z.string().trim().min(1, 'Escolha o bairro.').max(40),
  cidade: z.string().trim().min(1, 'Informe a cidade.').max(80, 'Use no máximo 80 caracteres.'),
  estado: textoCurto(2, 'Use a sigla do estado.'),
  cep: textoCurto(9, 'CEP inválido.'),
  referencia: textoCurto(120, 'Use no máximo 120 caracteres na referência.').nullable(),
});

export const storeCheckoutSchema = z
  .object({
    modalidade: z.enum(['ENTREGA', 'RETIRADA']),
    itens: z
      .array(itemSchema)
      .min(1, 'A sacola está vazia.')
      .max(50, 'Use no máximo 50 itens diferentes num pedido.'),
    /** O começo da janela escolhida, ou `null` para o quanto antes. */
    agendadoPara: z.iso.datetime({ offset: true }).nullable(),
    cliente: z.object({
      nome: z.string().trim().min(2, 'Informe seu nome.').max(80, 'Use no máximo 80 caracteres.'),
      telefone: z
        .string()
        .transform((telefone) => telefone.replace(/\D/g, ''))
        .refine(
          (telefone) => telefone.length >= 10 && telefone.length <= 11,
          'Informe o telefone com DDD.',
        ),
    }),
    entrega: enderecoSchema.nullable(),
    pagamento: z.enum([...FORMAS_DE_PAGAMENTO_ONLINE, ...FORMAS_DE_PAGAMENTO_NA_ENTREGA]),
    trocoPara: z.number().positive('Informe o valor para o troco.').max(99999.99).nullable(),
    observacao: textoCurto(200, 'Use no máximo 200 caracteres na observação.').nullable(),
    /**
     * O total que o cliente viu na tela. Não decide nada: se o cardápio mudou
     * enquanto a sacola esperava, o servidor recusa e diz o total novo, em vez
     * de cobrar diferente do que o cliente aceitou.
     */
    totalVisto: z.number().min(0).max(999999.99),
  })
  .refine((pedido) => pedido.modalidade === 'RETIRADA' || pedido.entrega !== null, {
    message: 'Informe o endereço da entrega.',
    path: ['entrega'],
  })
  .refine((pedido) => pedido.trocoPara === null || pedido.pagamento === 'DINHEIRO', {
    message: 'Troco só existe no pagamento em dinheiro.',
    path: ['trocoPara'],
  });

export type StoreCheckoutPayload = z.infer<typeof storeCheckoutSchema>;

/*
 * O que a loja faz com o pedido, no painel. As regras de cada passo (que etapa
 * vem depois de qual, até quando dá para cancelar) estão em
 * `store-order.rules.ts`, e o servidor as aplica.
 */

export const storeOrderStageSchema = z.object({
  para: z.enum(['ACEITO', 'EM_PREPARO', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE']),
  /** Só no aceite: o preparo deste pedido, quando a cozinha está mais lenta. */
  minutosDePreparo: z.number().int().min(1).max(240).optional(),
});

export const storeOrderCancelSchema = z.object({
  motivo: z.string().trim().min(1, 'Informe o motivo.').max(200, 'Use no máximo 200 caracteres.'),
});

export const storeAcceptsOrdersSchema = z.object({ recebePedidos: z.boolean() });

export type StoreOrderStagePayload = z.infer<typeof storeOrderStageSchema>;
export type StoreOrderCancelPayload = z.infer<typeof storeOrderCancelSchema>;
export type StoreAcceptsOrdersPayload = z.infer<typeof storeAcceptsOrdersSchema>;
