import { z } from 'zod';
import { MAXIMO_DE_PRODUTOS_NO_DESTAQUE } from './store-highlight.rules';
import { dataValida } from './store-schedule.rules';

/**
 * O destaque que a loja cadastra em Marketing → Destaques. Poucos campos, de
 * propósito: quem configura é um lojista pequeno, muitas vezes pelo celular.
 *
 * A ordem dos `produtoIds` é a ordem em que os produtos aparecem no cardápio.
 */

const dataSchema = z
  .string()
  .refine(dataValida, 'Use a data no formato AAAA-MM-DD.')
  .refine((data) => !Number.isNaN(Date.parse(`${data}T12:00:00Z`)), 'Data inválida.');

export const storeHighlightSchema = z
  .object({
    titulo: z
      .string({ error: 'Dê um título ao destaque.' })
      .trim()
      .min(2, 'Dê um título ao destaque, com pelo menos 2 letras.')
      .max(40, 'Use no máximo 40 caracteres no título.'),
    produtoIds: z
      .array(z.uuid('Produto inválido.'))
      .min(1, 'Escolha ao menos um produto.')
      .max(
        MAXIMO_DE_PRODUTOS_NO_DESTAQUE,
        `Use no máximo ${MAXIMO_DE_PRODUTOS_NO_DESTAQUE} produtos num destaque.`,
      )
      .refine((ids) => new Set(ids).size === ids.length, 'Cada produto entra uma vez só.'),
    inicio: dataSchema.nullable().default(null),
    fim: dataSchema.nullable().default(null),
    ativo: z.boolean().default(true),
  })
  .superRefine((destaque, contexto) => {
    if (destaque.inicio && destaque.fim && destaque.fim < destaque.inicio) {
      contexto.addIssue({
        code: 'custom',
        path: ['fim'],
        message: 'A data final vem antes da inicial.',
      });
    }
  });

/** Ligar e desligar: um toque na lista, sem abrir o formulário. */
export const storeHighlightActiveSchema = z.object({ ativo: z.boolean() });

/**
 * A ordem nova dos destaques: os ids de TODOS, do primeiro ao último. O servidor
 * confere que são os da loja, nem a mais nem a menos: uma lista velha (outra aba
 * criou ou apagou um destaque) é recusada, em vez de desfazer o que a outra aba fez.
 */
export const storeHighlightOrderSchema = z.object({
  ids: z
    .array(z.uuid('Destaque inválido.'))
    .min(1, 'Informe os destaques na ordem.')
    // Folga de propósito: o limite é da CRIAÇÃO. Uma loja que passou dele por uma corrida rara
    // (dois destaques criados juntos) precisa poder reordenar o que tem.
    .max(100, 'Use no máximo 100 destaques.')
    .refine((ids) => new Set(ids).size === ids.length, 'Cada destaque entra uma vez só.'),
});

export type StoreHighlightPayload = z.output<typeof storeHighlightSchema>;
export type StoreHighlightInput = z.input<typeof storeHighlightSchema>;
export type StoreHighlightActivePayload = z.infer<typeof storeHighlightActiveSchema>;
export type StoreHighlightOrderPayload = z.infer<typeof storeHighlightOrderSchema>;
