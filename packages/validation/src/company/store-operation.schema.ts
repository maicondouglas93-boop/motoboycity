import { z } from 'zod';

/**
 * Como a loja funciona, em blocos: o horário, o ajuste da hora, os tipos de
 * pedido e os avisos. Cada bloco é gravado pela tela dele — salvar o horário
 * não desfaz a pausa que outra aba acabou de fazer.
 *
 * Os nomes seguem o formato `OperacaoDaLoja` de `@motoboycity/types`, em
 * português, porque o JSON gravado é o mesmo que o painel edita. Os limites
 * são os que as telas já usam.
 */

const relogioSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a hora no formato 18:00.');

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD.')
  .refine((data) => !Number.isNaN(Date.parse(`${data}T12:00:00Z`)), 'Data inválida.');

const faixasSchema = z
  .array(z.object({ abre: relogioSchema, fecha: relogioSchema }))
  .max(3, 'Use no máximo 3 períodos por dia.');

export const storeScheduleSchema = z.object({
  semana: z
    .array(z.object({ dia: z.number().int().min(0).max(6), faixas: faixasSchema }))
    .length(7, 'Informe os sete dias da semana.')
    .refine(
      (dias) => new Set(dias.map((item) => item.dia)).size === 7,
      'Cada dia da semana aparece uma vez.',
    ),
  excecoes: z
    .array(
      z
        .object({
          id: z.string().trim().min(1).max(40),
          inicio: dataSchema,
          fim: dataSchema,
          tipo: z.enum(['FECHADO', 'HORARIO_ESPECIAL']),
          motivo: z.string().trim().max(80, 'Use no máximo 80 caracteres no motivo.'),
          faixas: faixasSchema,
        })
        .refine((excecao) => excecao.fim >= excecao.inicio, {
          message: 'A data final vem antes da inicial.',
          path: ['fim'],
        })
        .refine((excecao) => excecao.tipo !== 'HORARIO_ESPECIAL' || excecao.faixas.length > 0, {
          message: 'Horário especial precisa de pelo menos um período.',
          path: ['faixas'],
        }),
    )
    .max(100, 'Use no máximo 100 datas especiais.'),
  mensagemFechada: z.string().trim().max(160, 'Use no máximo 160 caracteres no recado.'),
});

/**
 * O ajuste da hora, ou `null` para voltar ao horário. O começo (`desde`) é o
 * relógio do servidor, e não o do aparelho: um celular com a hora errada não
 * pode pausar a loja no passado.
 */
export const storeManualStatusSchema = z.object({
  ajuste: z
    .object({
      estado: z.enum(['ABERTA', 'FECHADA', 'PAUSADA']),
      ate: z.iso.datetime({ offset: true }).nullable(),
    })
    .refine((ajuste) => ajuste.estado !== 'ABERTA' || ajuste.ate !== null, {
      message: 'Abrir fora do horário precisa de hora para terminar.',
      path: ['ate'],
    })
    .nullable(),
});

const enderecoSchema = z.object({
  rua: z.string().trim().min(1, 'Informe a rua.').max(120),
  numero: z.string().trim().min(1, 'Informe o número.').max(20),
  complemento: z.string().trim().max(60).nullable(),
  bairro: z.string().trim().min(1, 'Informe o bairro.').max(80),
  cidade: z.string().trim().min(1, 'Informe a cidade.').max(80),
  estado: z.string().trim().length(2, 'Use a sigla do estado.'),
});

export const storeOrderTypesSchema = z.object({
  recebimento: z.object({
    modo: z.enum(['AUTOMATICO', 'MANUAL']),
    minutosDePreparo: z.number().int().min(1).max(240),
    minutosDeEntrega: z.number().int().min(1).max(180),
    prazoDoAceiteMin: z.number().int().min(1).max(120).nullable(),
  }),
  entrega: z.object({
    ativa: z.boolean(),
    quemEntrega: z.enum(['MOTOBOYCITY', 'LOJA']),
    pedidoMinimo: z.number().min(0).max(99999.99).nullable(),
    agendamento: z.boolean(),
  }),
  retirada: z.object({
    ativa: z.boolean(),
    endereco: enderecoSchema.nullable(),
    instrucoes: z.string().trim().max(200, 'Use no máximo 200 caracteres.'),
    agendamento: z.boolean(),
  }),
  agendamento: z.object({
    permitir: z.boolean(),
    antecedenciaMinimaMin: z.number().int().min(0).max(10080),
    antecedenciaMaximaDias: z.number().int().min(0).max(60),
    intervaloMin: z
      .number()
      .int()
      .refine((minutos) => [15, 30, 60].includes(minutos), 'Use janelas de 15, 30 ou 60 minutos.'),
  }),
});

const avisoDoLojistaSchema = z.object({ push: z.boolean(), som: z.boolean() });

export const storeNotificationsSchema = z.object({
  lojista: z.object({
    NOVO_PEDIDO: avisoDoLojistaSchema,
    PEDIDO_CANCELADO: avisoDoLojistaSchema,
    PEDIDO_AGENDADO: avisoDoLojistaSchema,
    PAGAMENTO_RECEBIDO: avisoDoLojistaSchema,
    LOJA_FECHANDO: avisoDoLojistaSchema,
  }),
  minutosAntesDeFechar: z.number().int().min(5).max(120),
  repetirSom: z.boolean(),
  cliente: z.object({
    RECEBIDO: z.boolean(),
    ACEITO: z.boolean(),
    EM_PREPARO: z.boolean(),
    PRONTO_PARA_RETIRAR: z.boolean(),
    SAIU_PARA_ENTREGA: z.boolean(),
    ENTREGUE: z.boolean(),
    // O cliente sempre fica sabendo que o pedido caiu: sem esse aviso, ele
    // espera um pedido que não vem.
    CANCELADO: z
      .boolean()
      .refine((ligado) => ligado, 'O aviso de cancelamento ao cliente é obrigatório.'),
  }),
});

/** Pagar agora, pelo Asaas, direto na conta da loja. */
export const FORMAS_DE_PAGAMENTO_ONLINE = [
  'PIX_ONLINE',
  'CREDITO_ONLINE',
  'DEBITO_ONLINE',
] as const;
/** Pagar quando o pedido chega: dinheiro, ou a maquininha da loja. */
export const FORMAS_DE_PAGAMENTO_NA_ENTREGA = [
  'DINHEIRO',
  'PIX_MAQUININHA',
  'CREDITO_MAQUININHA',
  'DEBITO_MAQUININHA',
] as const;

export const storePaymentsSchema = z.object({
  pagamentos: z
    .array(z.enum([...FORMAS_DE_PAGAMENTO_ONLINE, ...FORMAS_DE_PAGAMENTO_NA_ENTREGA]))
    .min(1, 'Marque pelo menos uma forma: sem ela, o cliente não consegue fechar o pedido.')
    .refine((formas) => new Set(formas).size === formas.length, 'Cada forma aparece uma vez.'),
});

/**
 * O nome do bairro como chave: sem acento, sem maiúscula e sem espaço sobrando.
 * "Vila  Nova" e "vila nova" são o mesmo bairro — duas taxas para ele deixariam
 * o cliente escolher a mais barata.
 */
export function chaveDoBairro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Reais com até dois decimais, como o preço do cardápio. */
const taxaSchema = z
  .number({ error: 'Informe a taxa.' })
  .min(0, 'A taxa não pode ser negativa.')
  .max(999.99, 'Taxa alta demais.')
  .refine(
    (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
    'Use no máximo dois decimais.',
  );

/**
 * Os bairros que a loja atende na entrega, cada um com a taxa que ELA cobra do
 * cliente. Fora da lista, não há entrega — é assim que a loja limita a área.
 */
export const storeDeliveryAreasSchema = z.object({
  bairros: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        nome: z
          .string()
          .trim()
          .min(1, 'Informe o nome do bairro.')
          .max(60, 'Use no máximo 60 caracteres no nome do bairro.'),
        taxa: taxaSchema,
      }),
    )
    .max(200, 'Use no máximo 200 bairros.')
    .refine(
      (bairros) => new Set(bairros.map((bairro) => bairro.id)).size === bairros.length,
      'Cada bairro aparece uma vez.',
    )
    .refine(
      (bairros) =>
        new Set(bairros.map((bairro) => chaveDoBairro(bairro.nome))).size === bairros.length,
      'Há bairros com o mesmo nome.',
    ),
});

export type StoreSchedulePayload = z.infer<typeof storeScheduleSchema>;
export type StoreManualStatusPayload = z.infer<typeof storeManualStatusSchema>;
export type StoreOrderTypesPayload = z.infer<typeof storeOrderTypesSchema>;
export type StoreNotificationsPayload = z.infer<typeof storeNotificationsSchema>;
export type StorePaymentsPayload = z.infer<typeof storePaymentsSchema>;
export type StoreDeliveryAreasPayload = z.infer<typeof storeDeliveryAreasSchema>;
