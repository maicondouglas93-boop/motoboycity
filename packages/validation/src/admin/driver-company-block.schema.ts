import { z } from 'zod';

/**
 * Bloqueio seletivo entre motoboy e empresa.
 *
 * O motivo e obrigatorio porque a restricao interfere diretamente no
 * despacho e precisa ser compreensivel na auditoria administrativa.
 */
export const createDriverCompanyBlockSchema = z.object({
  companyId: z.uuid('Selecione uma empresa valida.'),
  reason: z
    .string()
    .trim()
    .min(3, 'Descreva o motivo do bloqueio.')
    .max(300, 'O motivo deve ter no maximo 300 caracteres.'),
});

export type CreateDriverCompanyBlockPayload = z.infer<typeof createDriverCompanyBlockSchema>;
