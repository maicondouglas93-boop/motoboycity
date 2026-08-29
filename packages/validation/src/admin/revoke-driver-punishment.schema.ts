import { z } from 'zod';

/**
 * Liberacao manual de um motoboy punido antes do prazo.
 *
 * O motivo e OBRIGATORIO, ao contrario da maioria dos campos livres do admin.
 * A punicao nasce de uma regra automatica; desfaze-la e uma decisao humana que
 * contradiz essa regra, e quem olhar o historico depois precisa saber por que.
 * Sem isso, so restaria a suspeita de favorecimento.
 */
export const revokeDriverPunishmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Descreva o motivo da liberacao.')
    .max(280, 'O motivo deve ter no maximo 280 caracteres.'),
});

export type RevokeDriverPunishmentPayload = z.infer<typeof revokeDriverPunishmentSchema>;
