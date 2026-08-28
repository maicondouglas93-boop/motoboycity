import { z } from 'zod';

export const aiqfomeTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    token_type: z.string().min(1).default('Bearer'),
    expires_in: z.coerce.number().int().positive(),
    scope: z.string().default(''),
    created_at: z.coerce.number().optional(),
  })
  .passthrough();

const aiqfomeStoreAddressSchema = z
  .object({
    street_name: z.string().default(''),
    number: z.coerce.string().default(''),
    city_name: z.string().default(''),
    state_uf: z.string().default(''),
  })
  .passthrough();

export const aiqfomeStoresResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.union([z.string(), z.number()]).transform(String),
          name: z.string().min(1),
          status: z.string().default('UNKNOWN'),
          address: aiqfomeStoreAddressSchema.nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const aiqfomeStoreInfoResponseSchema = z
  .object({
    data: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String),
        name: z.string().min(1),
        document_number: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

const storedStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string(),
  document: z.string(),
  address: z
    .object({
      street: z.string(),
      number: z.string(),
      city: z.string(),
      state: z.string(),
    })
    .nullable(),
});

export const aiqfomeIntegrationConfigSchema = z.object({
  version: z.literal(1),
  dispatchTrigger: z.literal('READY_ORDER'),
  acceptedPayment: z.literal('PREPAID_ONLY'),
  store: storedStoreSchema.nullable(),
  scopes: z.array(z.string()),
  errorCode: z.string().nullable(),
});

export type AiqfomeIntegrationConfig = z.infer<typeof aiqfomeIntegrationConfigSchema>;
export type AiqfomeTokenResponse = z.infer<typeof aiqfomeTokenResponseSchema>;

export function parseAiqfomeIntegrationConfig(value: unknown): AiqfomeIntegrationConfig {
  const parsed = aiqfomeIntegrationConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyAiqfomeIntegrationConfig();
}

export const aiqfomeStoredCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.string().min(1),
  scope: z.array(z.string()),
  expiresAt: z.string().datetime(),
});

export type AiqfomeStoredCredentials = z.infer<typeof aiqfomeStoredCredentialsSchema>;

export const aiqfomeOauthStateSchema = z.object({
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  integrationId: z.string().uuid(),
  oauthAttemptId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type AiqfomeOauthState = z.infer<typeof aiqfomeOauthStateSchema>;

export function emptyAiqfomeIntegrationConfig(): AiqfomeIntegrationConfig {
  return {
    version: 1,
    dispatchTrigger: 'READY_ORDER',
    acceptedPayment: 'PREPAID_ONLY',
    store: null,
    scopes: [],
    errorCode: null,
  };
}
