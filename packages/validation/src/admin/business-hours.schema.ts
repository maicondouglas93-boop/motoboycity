import { z } from 'zod';

const MINUTES_IN_DAY = 24 * 60;

/**
 * Uma faixa por intervalo. Um dia com pausa de almoço manda duas faixas para o
 * mesmo `weekday` — é assim que se fecha o meio do dia sem um campo próprio de
 * intervalo.
 *
 * `endMinute` menor que `startMinute` é permitido: atravessa a meia-noite, o
 * caso de quem fecha às 2h. O único rejeitado é o de tamanho zero, que não
 * abriria nunca.
 */
export const businessHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
    endMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
  })
  .refine((data) => data.startMinute !== data.endMinute, {
    message: 'A faixa precisa ter duração — abertura e fechamento não podem ser iguais.',
    path: ['endMinute'],
  });

export const replaceBusinessHoursSchema = z.object({
  hours: z.array(businessHourSchema).max(50, 'No máximo 50 faixas.'),
});

export type BusinessHourPayload = z.infer<typeof businessHourSchema>;
export type ReplaceBusinessHoursPayload = z.infer<typeof replaceBusinessHoursSchema>;
