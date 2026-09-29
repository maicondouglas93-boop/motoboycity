import { z } from 'zod';
import { dataValida, relogioValido } from './store-schedule.rules';

/**
 * A promoção que a loja cadastra em Marketing → Promoções. Poucos campos, de
 * propósito: quem configura é um lojista pequeno, muitas vezes pelo celular, e
 * cada regra a mais é uma promoção errada que ele só descobre no caixa.
 *
 * O que não vale para o tipo escolhido é DESCARTADO na saída (vira `null`), e não
 * gravado: quem trocou "20% OFF" por "leve 3, pague 2" não fica com um percentual
 * esquecido no banco.
 */

const dataSchema = z
  .string()
  .refine(dataValida, 'Use a data no formato AAAA-MM-DD.')
  .refine((data) => !Number.isNaN(Date.parse(`${data}T12:00:00Z`)), 'Data inválida.');

const relogioSchema = z.string().refine(relogioValido, 'Use a hora no formato 18:00.');

const inteiro = (minimo: number, maximo: number, mensagem: string) =>
  z.number({ error: mensagem }).int(mensagem).min(minimo, mensagem).max(maximo, mensagem);

const dinheiro = z
  .number({ error: 'Informe o preço.' })
  .positive('O preço promocional precisa ser maior que zero.')
  .max(99999.99, 'Preço alto demais.')
  .refine(
    (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
    'Use no máximo dois decimais.',
  );

export const TIPOS_DE_PROMOCAO = [
  'PERCENTUAL',
  'PRECO',
  'LEVE_PAGUE',
  'SEGUNDO_COM_DESCONTO',
] as const;

export const storePromotionSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Dê um nome à promoção, para achá-la na lista.')
      .max(60, 'Use no máximo 60 caracteres no nome.'),
    tipo: z.enum(TIPOS_DE_PROMOCAO, { error: 'Escolha o tipo da promoção.' }),
    alvo: z.enum(['PRODUTO', 'CATEGORIA'], { error: 'Escolha onde ela vale.' }),
    produtoId: z.uuid('Produto inválido.').nullable().default(null),
    categoriaId: z.uuid('Seção inválida.').nullable().default(null),
    percentual: z.number().nullable().default(null),
    precoPromocional: z.number().nullable().default(null),
    leve: z.number().nullable().default(null),
    pague: z.number().nullable().default(null),
    inicio: dataSchema.nullable().default(null),
    fim: dataSchema.nullable().default(null),
    horaInicio: relogioSchema.nullable().default(null),
    horaFim: relogioSchema.nullable().default(null),
    diasDaSemana: z
      .array(inteiro(0, 6, 'Dia da semana inválido.'))
      .max(7)
      .refine((dias) => new Set(dias).size === dias.length, 'Cada dia aparece uma vez.')
      .default([]),
    limiteDeUsos: inteiro(1, 1_000_000, 'Use um número inteiro a partir de 1.')
      .nullable()
      .default(null),
    ativa: z.boolean().default(true),
  })
  .superRefine((promocao, contexto) => {
    const erro = (campo: string, mensagem: string) =>
      contexto.addIssue({ code: 'custom', path: [campo], message: mensagem });

    if (promocao.alvo === 'PRODUTO') {
      if (!promocao.produtoId) erro('produtoId', 'Escolha o produto.');
    } else if (!promocao.categoriaId) {
      erro('categoriaId', 'Escolha a seção.');
    }

    switch (promocao.tipo) {
      case 'PERCENTUAL': {
        const { percentual } = promocao;
        if (
          percentual === null ||
          !Number.isInteger(percentual) ||
          percentual < 1 ||
          percentual > 90
        ) {
          erro('percentual', 'Use um desconto inteiro de 1% a 90%.');
        }
        break;
      }
      case 'PRECO': {
        if (promocao.alvo !== 'PRODUTO') {
          erro('alvo', 'O preço promocional vale para um produto, e não para uma seção inteira.');
        }
        const conferido = dinheiro.safeParse(promocao.precoPromocional ?? undefined);
        if (!conferido.success) {
          erro('precoPromocional', conferido.error.issues[0]?.message ?? 'Informe o preço.');
        }
        break;
      }
      case 'LEVE_PAGUE': {
        const { leve, pague } = promocao;
        if (leve === null || !Number.isInteger(leve) || leve < 2 || leve > 10) {
          erro('leve', 'Leve de 2 a 10 unidades.');
        }
        if (
          pague === null ||
          !Number.isInteger(pague) ||
          pague < 1 ||
          (leve !== null && pague >= leve)
        ) {
          erro('pague', 'Pague menos do que leva, a partir de 1.');
        }
        break;
      }
      case 'SEGUNDO_COM_DESCONTO': {
        const { percentual } = promocao;
        if (
          percentual === null ||
          !Number.isInteger(percentual) ||
          percentual < 1 ||
          percentual > 100
        ) {
          erro('percentual', 'Use um desconto inteiro de 1% a 100% no segundo item.');
        }
        break;
      }
    }

    if (promocao.inicio && promocao.fim && promocao.fim < promocao.inicio) {
      erro('fim', 'A data final vem antes da inicial.');
    }
    if ((promocao.horaInicio === null) !== (promocao.horaFim === null)) {
      erro(
        promocao.horaInicio === null ? 'horaInicio' : 'horaFim',
        'Informe o começo e o fim do horário, ou nenhum dos dois.',
      );
    }
  })
  .transform((promocao) => {
    const { tipo, alvo } = promocao;
    return {
      ...promocao,
      // Só o que o tipo usa fica: o resto é descartado.
      produtoId: alvo === 'PRODUTO' ? promocao.produtoId : null,
      categoriaId: alvo === 'CATEGORIA' ? promocao.categoriaId : null,
      percentual:
        tipo === 'PERCENTUAL' || tipo === 'SEGUNDO_COM_DESCONTO' ? promocao.percentual : null,
      precoPromocional: tipo === 'PRECO' ? promocao.precoPromocional : null,
      leve: tipo === 'LEVE_PAGUE' ? promocao.leve : null,
      pague: tipo === 'LEVE_PAGUE' ? promocao.pague : null,
    };
  });

/** Ligar e desligar: um toque na lista, sem abrir o formulário. */
export const storePromotionActiveSchema = z.object({ ativa: z.boolean() });

export type StorePromotionPayload = z.output<typeof storePromotionSchema>;
export type StorePromotionInput = z.input<typeof storePromotionSchema>;
export type StorePromotionActivePayload = z.infer<typeof storePromotionActiveSchema>;
