import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato AAAA-MM-DD.');

function civilDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

export const adminFinancialOverviewQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

/**
 * Extrato de recebimentos: o que entrou, e quando.
 *
 * `from` e `to` sao obrigatorios, ao contrario do resumo por periodo. Extrato
 * sem recorte devolveria a operacao inteira desde o primeiro dia — cresce sem
 * limite e nunca e o que alguem quer ver.
 */
export const listReceiptsQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    /** Somente faturas quitadas online, para conferir contra o extrato bancario. */
    onlineOnly: z.coerce.boolean().optional().default(false),
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  });

/**
 * Resultado por competência exige um intervalo explícito e limitado.
 *
 * A API lê as entregas concluídas para compor dimensões e série diária; limitar
 * a 366 dias evita uma consulta acidental de todo o histórico operacional.
 */
export const financialStatementQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  })
  .refine((data) => civilDayNumber(data.to) - civilDayNumber(data.from) <= 365, {
    message: 'O demonstrativo aceita no máximo 366 dias por consulta.',
    path: ['to'],
  });

/**
 * Extrato por ciclo financeiro: cada entrega traz competência, fatura,
 * recebimento e repasse. O limite menor protege a consulta que precisa ler as
 * relações detalhadas de cada pedido, e não apenas agregados.
 */
export const financialCycleQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial não pode ser posterior à data final.',
    path: ['from'],
  })
  .refine((data) => civilDayNumber(data.to) - civilDayNumber(data.from) <= 92, {
    message: 'O extrato financeiro aceita no máximo 93 dias por consulta.',
    path: ['to'],
  });

/**
 * Previsao de caixa detalhada por vencimento e liberacao.
 *
 * O limite acompanha o extrato financeiro: a resposta devolve as faturas,
 * repasses e saques que explicam os totais diarios, nao somente agregados.
 */
export const cashFlowForecastQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'A data inicial nao pode ser posterior a data final.',
    path: ['from'],
  })
  .refine((data) => civilDayNumber(data.to) - civilDayNumber(data.from) <= 92, {
    message: 'A previsao de caixa aceita no maximo 93 dias por consulta.',
    path: ['to'],
  });

/**
 * Ajuste manual na carteira do motoboy.
 *
 * O motivo e OBRIGATORIO e tem piso de 10 caracteres. Ajuste sem explicacao e
 * movimentacao de dinheiro sem rastro: seis meses depois ninguem lembra se
 * aqueles R$ 40 foram acerto combinado, correcao de repasse errado ou engano.
 * O piso existe porque "ajuste" e "correcao" nao explicam nada.
 *
 * O valor e sempre POSITIVO; quem decide a direcao e o `type`. Aceitar negativo
 * abriria a porta para um credito de -50 significar debito, e a mesma operacao
 * teria duas formas de ser escrita.
 */
export const adjustDriverWalletSchema = z.object({
  type: z.enum(['CREDIT', 'DEBIT']),
  amount: z
    .number()
    .positive('O valor do ajuste deve ser maior que zero.')
    .max(100_000, 'Valor acima do limite permitido para ajuste manual.')
    // Dinheiro no banco e Decimal(10,2): mais de duas casas seria arredondado
    // em silencio e o extrato nao fecharia com o que o admin digitou.
    .refine((valor) => Number.isInteger(Math.round(valor * 100)) && (valor * 100) % 1 === 0, {
      message: 'Use no máximo duas casas decimais.',
    }),
  reason: z
    .string()
    .trim()
    .min(10, 'Explique o motivo do ajuste em pelo menos 10 caracteres.')
    .max(300, 'O motivo deve ter no máximo 300 caracteres.'),
});

export const listAdminWalletsQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AdminFinancialOverviewQuery = z.infer<typeof adminFinancialOverviewQuerySchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
export type AdjustDriverWalletPayload = z.infer<typeof adjustDriverWalletSchema>;
export type FinancialStatementQuery = z.infer<typeof financialStatementQuerySchema>;
export type FinancialCycleQuery = z.infer<typeof financialCycleQuerySchema>;
export type CashFlowForecastQuery = z.infer<typeof cashFlowForecastQuerySchema>;
export type ListAdminWalletsQuery = z.infer<typeof listAdminWalletsQuerySchema>;
