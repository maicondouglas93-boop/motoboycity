import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export const AIQFOME_AUTHORIZE_URL = 'https://id.magalu.com/login';
export const AIQFOME_TOKEN_URL = 'https://id.magalu.com/oauth/token';
export const AIQFOME_API_BASE_URL = 'https://plataforma.aiqfome.com/api/v2';
export const AIQFOME_SCOPES = [
  'aqf:store:read',
  'aqf:store:create',
  'aqf:order:read',
  'aqf:order:create',
] as const;

const DEFAULT_COMPANY_WEB_URL = 'https://motoboycity-company-web.vercel.app';

export interface AiqfomeRuntimeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
  companyWebUrl: string;
}

export function readAiqfomeRuntimeConfig(config: ConfigService): AiqfomeRuntimeConfig | null {
  const clientId = config.get<string>('AIQFOME_CLIENT_ID')?.trim() ?? '';
  const clientSecret = config.get<string>('AIQFOME_CLIENT_SECRET')?.trim() ?? '';
  const redirectUri = config.get<string>('AIQFOME_REDIRECT_URI')?.trim() ?? '';
  const tokenEncryptionKey = config.get<string>('AIQFOME_TOKEN_ENCRYPTION_KEY')?.trim() ?? '';
  const companyWebUrl = config.get<string>('COMPANY_WEB_URL')?.trim() || DEFAULT_COMPANY_WEB_URL;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !isValidTokenEncryptionKey(tokenEncryptionKey)
  ) {
    return null;
  }

  if (!isAllowedApplicationUrl(redirectUri) || !isAllowedApplicationUrl(companyWebUrl)) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenEncryptionKey,
    companyWebUrl: new URL(companyWebUrl).origin,
  };
}

export function requireAiqfomeRuntimeConfig(config: ConfigService): AiqfomeRuntimeConfig {
  const value = readAiqfomeRuntimeConfig(config);
  if (!value) {
    throw new ServiceUnavailableException(
      'A integração aiqfome ainda não está configurada no servidor.',
    );
  }
  return value;
}

export function resolveCompanyWebUrl(config: ConfigService): string {
  const raw = config.get<string>('COMPANY_WEB_URL')?.trim() || DEFAULT_COMPANY_WEB_URL;
  return isAllowedApplicationUrl(raw) ? new URL(raw).origin : DEFAULT_COMPANY_WEB_URL;
}

export function resolveAiqfomeWebhookUrl(config: ConfigService, publicId: string): string {
  const runtime = requireAiqfomeRuntimeConfig(config);
  return new URL(
    `/integrations/aiqfome/webhooks/${encodeURIComponent(publicId)}`,
    runtime.redirectUri,
  ).toString();
}

export function hasRequiredAiqfomeScopes(scopes: readonly string[]): boolean {
  const values = new Set(scopes);
  const canWriteOrders = values.has('aqf:order:create') || values.has('aqf:order:write');
  return (
    values.has('aqf:store:read') &&
    values.has('aqf:store:create') &&
    values.has('aqf:order:read') &&
    canWriteOrders
  );
}

function isAllowedApplicationUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost(url.hostname));
  } catch {
    return false;
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isValidTokenEncryptionKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}
