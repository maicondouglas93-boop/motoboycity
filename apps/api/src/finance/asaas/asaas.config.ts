import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export interface AsaasRuntimeConfig {
  apiKey: string;
  webhookToken: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
}

export type AsaasRuntimeEnvironment = AsaasRuntimeConfig['environment'];

const BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const;

export function readAsaasRuntimeConfig(config: ConfigService): AsaasRuntimeConfig | null {
  const apiKey = config.get<string>('ASAAS_API_KEY')?.trim();
  const webhookToken = readAsaasWebhookToken(config);
  const environment = readAsaasEnvironment(config);

  if (!apiKey || !webhookToken || !environment) {
    return null;
  }

  return {
    apiKey,
    webhookToken,
    environment,
    baseUrl: BASE_URLS[environment],
  };
}

export function readAsaasEnvironment(config: ConfigService): AsaasRuntimeEnvironment | null {
  const environment = config.get<string>('ASAAS_ENVIRONMENT')?.trim().toLowerCase();
  return environment === 'sandbox' || environment === 'production' ? environment : null;
}

export function readAsaasWebhookToken(config: ConfigService): string | null {
  const token = config.get<string>('ASAAS_WEBHOOK_TOKEN')?.trim();
  if (!token || token.length < 32 || token.length > 255 || /\s/.test(token)) return null;
  return token;
}

export function requireAsaasRuntimeConfig(config: ConfigService): AsaasRuntimeConfig {
  const runtime = readAsaasRuntimeConfig(config);
  if (!runtime) {
    throw new ServiceUnavailableException(
      'Pagamento Pix indisponível. Configure ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_ENVIRONMENT na API.',
    );
  }
  return runtime;
}
