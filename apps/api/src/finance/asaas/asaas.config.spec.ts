import type { ConfigService } from '@nestjs/config';
import { readAsaasRuntimeConfig, readAsaasWebhookToken } from './asaas.config';

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('Asaas runtime config', () => {
  it('nao habilita sem ambiente explicito', () => {
    expect(
      readAsaasRuntimeConfig(
        config({ ASAAS_API_KEY: 'key', ASAAS_WEBHOOK_TOKEN: 'x'.repeat(32) }),
      ),
    ).toBeNull();
  });

  it('usa somente as URLs oficiais predefinidas', () => {
    expect(
      readAsaasRuntimeConfig(
        config({
          ASAAS_API_KEY: 'key',
          ASAAS_WEBHOOK_TOKEN: 'x'.repeat(32),
          ASAAS_ENVIRONMENT: 'production',
        }),
      ),
    ).toMatchObject({ environment: 'production', baseUrl: 'https://api.asaas.com/v3' });
  });

  it('recusa token de webhook curto ou com espaco', () => {
    expect(
      readAsaasRuntimeConfig(
        config({
          ASAAS_API_KEY: 'key',
          ASAAS_WEBHOOK_TOKEN: 'token inseguro',
          ASAAS_ENVIRONMENT: 'sandbox',
        }),
      ),
    ).toBeNull();
  });

  it('valida o token do webhook independentemente da API key', () => {
    expect(readAsaasWebhookToken(config({ ASAAS_WEBHOOK_TOKEN: 'w'.repeat(40) }))).toBe(
      'w'.repeat(40),
    );
  });
});
