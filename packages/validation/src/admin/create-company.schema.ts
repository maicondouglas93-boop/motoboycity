import { z } from 'zod';
import { registerCompanyApiSchema } from '../auth/register-company.schema';

export const createAdminCompanySchema = registerCompanyApiSchema
  .extend({
    regionId: z.string().uuid('Selecione uma regiao valida.'),
  })
  .strict();

export type CreateAdminCompanyPayload = z.infer<typeof createAdminCompanySchema>;
