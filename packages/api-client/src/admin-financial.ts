import type {
  AdminDriverWalletDetail,
  AdminDriverWalletItem,
  AdminFinancialOverview,
  WalletTransactionStatus,
  WithdrawalRequestItem,
  WithdrawalRequestStatus,
} from '@motoboycity/types';
import { parseJsonOrThrow } from './api-error';

export interface AdminFinancialApiConfig {
  baseUrl: string;
}

export function createAdminFinancialApi({ baseUrl }: AdminFinancialApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async overview(
      accessToken: string,
      filters?: { from?: string; to?: string },
    ): Promise<AdminFinancialOverview> {
      const params = new URLSearchParams();
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/financial/overview${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminFinancialOverview>(response);
    },

    async listDriverWallets(
      accessToken: string,
      filters?: { search?: string; limit?: number },
    ): Promise<AdminDriverWalletItem[]> {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/financial/driver-wallets${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverWalletItem[]>(response);
    },

    async getDriverWallet(
      accessToken: string,
      driverId: string,
      filters?: { status?: WalletTransactionStatus; from?: string; to?: string; limit?: number },
    ): Promise<AdminDriverWalletDetail> {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(
        `${baseUrl}/admin/financial/driver-wallets/${driverId}${query}`,
        {
          headers: withAuth(accessToken),
        },
      );
      return parseJsonOrThrow<AdminDriverWalletDetail>(response);
    },

    async listWithdrawals(
      accessToken: string,
      filters?: {
        status?: WithdrawalRequestStatus;
        search?: string;
        from?: string;
        to?: string;
        limit?: number;
      },
    ): Promise<WithdrawalRequestItem[]> {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.from) params.set('from', filters.from);
      if (filters?.to) params.set('to', filters.to);
      if (filters?.limit) params.set('limit', String(filters.limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${baseUrl}/admin/financial/withdrawals${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<WithdrawalRequestItem[]>(response);
    },

    async getWithdrawal(accessToken: string, withdrawalId: string): Promise<WithdrawalRequestItem> {
      const response = await fetch(`${baseUrl}/admin/financial/withdrawals/${withdrawalId}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },

    async approveWithdrawal(
      accessToken: string,
      withdrawalId: string,
      payload: { note?: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(`${baseUrl}/admin/financial/withdrawals/${withdrawalId}/approve`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },

    async markWithdrawalPaid(
      accessToken: string,
      withdrawalId: string,
      payload: { note?: string; paymentReference?: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(`${baseUrl}/admin/financial/withdrawals/${withdrawalId}/mark-paid`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },

    async rejectWithdrawal(
      accessToken: string,
      withdrawalId: string,
      payload: { note: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(`${baseUrl}/admin/financial/withdrawals/${withdrawalId}/reject`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },
  };
}
