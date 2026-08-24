import { z } from 'zod';
import { registerDriverApiSchema } from '../auth/register-driver.schema';
import { replaceDriverServiceTypesSchema } from './replace-driver-service-types.schema';

export const createAdminDriverSchema = registerDriverApiSchema
  .extend({
    regionId: z.string().uuid('Selecione uma região válida.'),
    serviceTypeIds: replaceDriverServiceTypesSchema.shape.serviceTypeIds,
  })
  .strict();

export type CreateAdminDriverPayload = z.infer<typeof createAdminDriverSchema>;
