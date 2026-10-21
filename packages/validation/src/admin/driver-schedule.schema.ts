import { z } from 'zod';
import {
  MAX_TURNOS_POR_DIA,
  escalaTemTurno,
  turnosSobrepostos,
} from '../driver/driver-schedule.rules';

/**
 * A escala que a central monta na ficha do motoboy.
 *
 * O formato e o mesmo `DriverWorkSchedule` de `@motoboycity/types`: o banco
 * guarda este JSON, e o servidor o le de volta com este mesmo schema antes de
 * decidir se o motoboy pode trabalhar.
 */

const relogioSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a hora no formato 18:00.');

const turnoSchema = z
  .object({ start: relogioSchema, end: relogioSchema })
  .refine((turno) => turno.start !== turno.end, {
    message: 'O turno precisa terminar em outro horário.',
    path: ['end'],
  });

export const driverWorkScheduleSchema = z
  .object({
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          shifts: z
            .array(turnoSchema)
            .max(MAX_TURNOS_POR_DIA, `Use no máximo ${MAX_TURNOS_POR_DIA} turnos por dia.`),
        }),
      )
      .length(7, 'Informe os sete dias da semana.')
      .refine(
        (dias) => new Set(dias.map((dia) => dia.weekday)).size === 7,
        'Cada dia da semana aparece uma vez.',
      ),
  })
  .refine(escalaTemTurno, {
    message: 'Marque pelo menos um turno. Para deixar o motoboy livre, remova a escala.',
    path: ['days'],
  })
  .superRefine((escala, ctx) => {
    for (const problema of turnosSobrepostos(escala)) {
      ctx.addIssue({ code: 'custom', message: problema, path: ['days'] });
    }
  });

/**
 * Gravar ou remover a escala. `null` remove: o motoboy volta a trabalhar livre,
 * a qualquer hora.
 */
export const adminDriverScheduleSchema = z.object({
  schedule: driverWorkScheduleSchema.nullable(),
});

export type AdminDriverSchedulePayload = z.infer<typeof adminDriverScheduleSchema>;
