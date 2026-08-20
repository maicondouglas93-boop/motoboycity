import type {
  DriverWalletSummary,
  WalletTransactionStatus,
  WithdrawalRequestItem,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface DriverWalletApiConfig {
  baseUrl: string;
}

export function createDriverWalletApi({ baseUrl }: DriverWalletApiConfig) {
  return {
    async get(
      accessToken: string,
      filters?: { status?: WalletTransactionStatus; from?: string; to?: string; limit?: number },
    ): Promise<DriverWalletSummary> {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${baseUrl}/driver/wallet${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<DriverWalletSummary>(response);
    },

    async listWithdrawals(accessToken: string): Promise<WithdrawalRequestItem[]> {
      const response = await fetch(`${baseUrl}/driver/wallet/withdrawals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<WithdrawalRequestItem[]>(response);
    },

    async requestWithdrawal(accessToken: string, amount: number): Promise<WithdrawalRequestItem> {
      const response = await fetch(`${baseUrl}/driver/wallet/withdrawals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },
  };
}
