import { z } from 'zod';
import { CODIGO_DO_CUPOM, normalizarCodigoDoCupom } from './store-coupon.rules';
import { dataValida } from './store-schedule.rules';

/**
 * O cupom que a loja cadastra em Marketing → Cupons. Poucos campos, de propósito:
 * quem configura é um lojista pequeno, muitas vezes pelo celular.
 *
 * O que não vale para o tipo escolhido é DESCARTADO na saída (vira `null`): quem
 * trocou "10%" por "R$ 5,00" não fica com um percentual esquecido no banco.
 */

const dataSchema = z
  .string()
  .refine(dataValida, 'Use a data no formato AAAA-MM-DD.')
  .refine((data) => !Number.isNaN(Date.parse(`${data}T12:00:00Z`)), 'Data inválida.');

const inteiro = (minimo: number, maximo: number, mensagem: string) =>
  z.number({ error: mensagem }).int(mensagem).min(minimo, mensagem).max(maximo, mensagem);

const dinheiro = (mensagemDoValor: string) =>
  z
    .number({ error: mensagemDoValor })
    .positive(mensagemDoValor)
    .max(99999.99, 'Valor alto demais.')
    .refine(
      (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
      'Use no máximo dois decimais.',
    );

export const TIPOS_DE_CUPOM = ['PERCENTUAL', 'VALOR'] as const;

export const storeCouponSchema = z
  .object({
    codigo: z
      .string({ error: 'Informe o código do cupom.' })
      .transform(normalizarCodigoDoCupom)
      .refine(
        (codigo) => CODIGO_DO_CUPOM.test(codigo),
        'Use de 3 a 20 letras, números, hífen ou sublinhado, sem espaços.',
      ),
    tipo: z.enum(TIPOS_DE_CUPOM, { error: 'Escolha o tipo do desconto.' }),
    percentual: z.number().nullable().default(null),
    valor: z.number().nullable().default(null),
    pedidoMinimo: dinheiro('O pedido mínimo precisa ser maior que zero.').nullable().default(null),
    descontoMaximo: dinheiro('O desconto máximo precisa ser maior que zero.')
      .nullable()
      .default(null),
    inicio: dataSchema.nullable().default(null),
    fim: dataSchema.nullable().default(null),
    limiteDeUsos: inteiro(1, 1_000_000, 'Use um número inteiro a partir de 1.')
      .nullable()
      .default(null),
    limitePorCliente: inteiro(1, 1_000, 'Use um número inteiro a partir de 1.')
      .nullable()
      .default(null),
    produtoIds: z
      .array(z.uuid('Produto inválido.'))
      .max(200, 'Escolha no máximo 200 produtos.')
      .default([]),
    categoriaIds: z
      .array(z.uuid('Seção inválida.'))
      .max(100, 'Escolha no máximo 100 seções.')
      .default([]),
    valeEmPromocao: z.boolean().default(false),
    /** Nasce escondido: mostrar um cupom a todos os clientes é uma escolha da loja. */
    mostrarNoCheckout: z.boolean().default(false),
    ativo: z.boolean().default(true),
  })
  .superRefine((cupom, contexto) => {
    const erro = (campo: string, mensagem: string) =>
      contexto.addIssue({ code: 'custom', path: [campo], message: mensagem });

    if (cupom.tipo === 'PERCENTUAL') {
      const { percentual } = cupom;
      if (
        percentual === null ||
        !Number.isInteger(percentual) ||
        percentual < 1 ||
        percentual > 100
      ) {
        erro('percentual', 'Use um desconto inteiro de 1% a 100%.');
      }
    } else {
      const conferido = dinheiro('Informe o valor do desconto.').safeParse(
        cupom.valor ?? undefined,
      );
      if (!conferido.success) {
        erro('valor', conferido.error.issues[0]?.message ?? 'Informe o valor do desconto.');
      }
    }

    if (cupom.inicio && cupom.fim && cupom.fim < cupom.inicio) {
      erro('fim', 'A data final vem antes da inicial.');
    }
    if (
      cupom.limiteDeUsos !== null &&
      cupom.limitePorCliente !== null &&
      cupom.limitePorCliente > cupom.limiteDeUsos
    ) {
      erro('limitePorCliente', 'O limite por cliente não pode passar do limite total.');
    }
  })
  .transform((cupom) => ({
    ...cupom,
    // Só o que o tipo usa fica: o resto é descartado.
    percentual: cupom.tipo === 'PERCENTUAL' ? cupom.percentual : null,
    valor: cupom.tipo === 'VALOR' ? cupom.valor : null,
    descontoMaximo: cupom.tipo === 'PERCENTUAL' ? cupom.descontoMaximo : null,
    produtoIds: [...new Set(cupom.produtoIds)],
    categoriaIds: [...new Set(cupom.categoriaIds)],
  }));

/** Ligar e desligar: um toque na lista, sem abrir o formulário. */
export const storeCouponActiveSchema = z.object({ ativo: z.boolean() });

export type StoreCouponPayload = z.output<typeof storeCouponSchema>;
export type StoreCouponInput = z.input<typeof storeCouponSchema>;
export type StoreCouponActivePayload = z.infer<typeof storeCouponActiveSchema>;
