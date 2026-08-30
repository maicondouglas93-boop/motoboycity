import { z } from 'zod';

/**
 * Aviso de vida de uma rotina externa.
 *
 * Tudo opcional menos nada: o corpo inteiro pode vir vazio, porque o que
 * importa é a chegada do aviso, não o conteúdo. `sizeBytes` e `detail` servem
 * só para o painel poder dizer "1,3 MB às 03:10" em vez de "rodou".
 */
export const jobCheckInSchema = z.object({
  sizeBytes: z.coerce.number().int().nonnegative().optional(),
  detail: z.string().trim().max(200).optional(),
});

export type JobCheckInPayload = z.infer<typeof jobCheckInSchema>;
