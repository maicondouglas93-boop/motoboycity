import { z } from 'zod';

export const reorderDispatchQueueSchema = z.object({
  driverIds: z
    .array(z.string().trim().min(1))
    .min(1, 'Informe ao menos um motoboy para reorganizar a fila.')
    .max(250, 'A fila pode conter no maximo 250 motoboys.')
    .refine((driverIds) => new Set(driverIds).size === driverIds.length, {
      message: 'A fila nao pode repetir o mesmo motoboy.',
    }),
});

export type ReorderDispatchQueuePayload = z.infer<typeof reorderDispatchQueueSchema>;
