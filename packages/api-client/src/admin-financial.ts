import type {
  AdminDriverWalletDetail,
  AdminDriverWalletItem,
  AdminFinancialOverview,
  WalletTransactionStatus,
  WithdrawalRequestItem,
  WithdrawalRequestStatus,
  CashPositionItem,
  CashFlowForecastReport,
  FinancialCycleReport,
  FinancialAuditReport,
  FinancialStatementReport,
  PayoutsAgingReport,
  ReceivablesAgingReport,
  ReceiptsReport,
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
    /** Posicao de caixa agora. Sem periodo: e estado, nao relatorio. */
    async cashPosition(accessToken: string): Promise<CashPositionItem> {
      const response = await fetch(`${baseUrl}/admin/financial/cash-position`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<CashPositionItem>(response);
    },

    /** Contas a receber e aging no instante atual, sem filtro de período. */
    async receivablesAging(accessToken: string): Promise<ReceivablesAgingReport> {
      const response = await fetch(`${baseUrl}/admin/financial/receivables-aging`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<ReceivablesAgingReport>(response);
    },

    /** Obrigações, saques abertos e aging atual por entregador. */
    async payoutsAging(accessToken: string): Promise<PayoutsAgingReport> {
      const response = await fetch(`${baseUrl}/admin/financial/payouts-aging`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<PayoutsAgingReport>(response);
    },

    /** Resultado por competência das entregas concluídas no intervalo. */
    async financialStatement(
      accessToken: string,
      filters: { from: string; to: string },
    ): Promise<FinancialStatementReport> {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      const response = await fetch(
        `${baseUrl}/admin/financial/financial-statement?${params.toString()}`,
        { headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<FinancialStatementReport>(response);
    },

    /** Ciclo por pedido: competência, fatura, recebimento e repasse. */
    async financialCycle(
      accessToken: string,
      filters: { from: string; to: string },
    ): Promise<FinancialCycleReport> {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      const response = await fetch(
        `${baseUrl}/admin/financial/financial-cycle?${params.toString()}`,
        { headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<FinancialCycleReport>(response);
    },

    /** Agenda de vencimentos, liberacoes, saques abertos e caixa realizado. */
    async cashFlowForecast(
      accessToken: string,
      filters: { from: string; to: string },
    ): Promise<CashFlowForecastReport> {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      const response = await fetch(
        `${baseUrl}/admin/financial/cash-flow-forecast?${params.toString()}`,
        { headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<CashFlowForecastReport>(response);
    },

    /** Ajustes e mudancas financeiras com autor, motivo e valor. */
    async financialAudit(
      accessToken: string,
      filters: { from: string; to: string },
    ): Promise<FinancialAuditReport> {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      const response = await fetch(`${baseUrl}/admin/financial/audit-trail?${params.toString()}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<FinancialAuditReport>(response);
    },

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

    /**
     * Extrato de recebimentos. Periodo obrigatorio: sem recorte isto devolveria
     * a operacao inteira desde o primeiro dia.
     */
    async receipts(
      accessToken: string,
      filters: { from: string; to: string; onlineOnly?: boolean },
    ): Promise<ReceiptsReport> {
      const params = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.onlineOnly) params.set('onlineOnly', 'true');

      const response = await fetch(`${baseUrl}/admin/financial/receipts?${params.toString()}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<ReceiptsReport>(response);
    },

    /**
     * Ajuste manual na carteira. Motivo obrigatorio: o servidor recusa sem ele.
     */
    async adjustDriverWallet(
      accessToken: string,
      driverId: string,
      payload: { type: 'CREDIT' | 'DEBIT'; amount: number; reason: string },
    ): Promise<AdminDriverWalletDetail> {
      const response = await fetch(
        `${baseUrl}/admin/financial/driver-wallets/${driverId}/adjustments`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminDriverWalletDetail>(response);
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
      payload: { note: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(
        `${baseUrl}/admin/financial/withdrawals/${withdrawalId}/approve`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },

    async markWithdrawalPaid(
      accessToken: string,
      withdrawalId: string,
      payload: { note: string; paymentReference?: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(
        `${baseUrl}/admin/financial/withdrawals/${withdrawalId}/mark-paid`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },

    async rejectWithdrawal(
      accessToken: string,
      withdrawalId: string,
      payload: { note: string },
    ): Promise<WithdrawalRequestItem> {
      const response = await fetch(
        `${baseUrl}/admin/financial/withdrawals/${withdrawalId}/reject`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<WithdrawalRequestItem>(response);
    },
  };
}
