import type {
  LoginPayload,
  RegisterCompanyPayload,
  RegisterDriverPayload,
} from '@motoboycity/validation';
import type {
  AuthUser,
  LoginResult,
  RegisterCompanyResult,
  RegisterDriverResult,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface AuthApiConfig {
  baseUrl: string;
}

export function createAuthApi({ baseUrl }: AuthApiConfig) {
  return {
    async registerCompany(payload: RegisterCompanyPayload): Promise<RegisterCompanyResult> {
      const response = await apiFetch(`${baseUrl}/auth/register/company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<RegisterCompanyResult>(response);
    },

    async registerDriver(payload: RegisterDriverPayload): Promise<RegisterDriverResult> {
      const response = await apiFetch(`${baseUrl}/auth/register/driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<RegisterDriverResult>(response);
    },

    async login(payload: LoginPayload): Promise<LoginResult> {
      const response = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<LoginResult>(response);
    },

    async me(accessToken: string): Promise<AuthUser> {
      const response = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<AuthUser>(response);
    },

    async uploadAvatar(accessToken: string, formData: FormData): Promise<AuthUser> {
      const response = await apiFetch(`${baseUrl}/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      return parseJsonOrThrow<AuthUser>(response);
    },
  };
}
