export type WalletTransactionType =
  | 'CREDIT_REPASSE'
  | 'DEBIT_WITHDRAWAL'
  | 'DEBIT_FEE'
  | 'CREDIT_ADVANCE_RELEASE'
  | 'CREDIT_ADJUSTMENT'
  | 'DEBIT_ADJUSTMENT'
  | 'CREDIT_REFUND';

export type WalletTransactionStatus = 'PENDING' | 'RELEASED' | 'CANCELLED';
export type WithdrawalRequestStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';

export interface WalletDeliveryReference {
  id: string;
  displayNumber: number;
  companyName: string;
}

export interface WalletTransactionItem {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  relatedDelivery: WalletDeliveryReference | null;
  releaseAt: string | null;
  createdAt: string;
}

export interface DriverWalletSummary {
  walletId: string | null;
  availableBalance: number;
  blockedBalance: number;
  pendingWithdrawalAmount: number;
  cacheMatchesLedger: boolean;
  transactions: WalletTransactionItem[];
  withdrawalRequests: WithdrawalRequestItem[];
}

export interface WithdrawalRequestStatusHistoryItem {
  fromStatus: WithdrawalRequestStatus | null;
  toStatus: WithdrawalRequestStatus;
  changedAt: string;
  changedBy: { id: string; name: string } | null;
  note: string | null;
}

export interface WithdrawalRequestItem {
  id: string;
  walletId: string;
  driver: { id: string; name: string; email: string };
  requestedAmount: number;
  feeAmount: number;
  netAmount: number;
  status: WithdrawalRequestStatus;
  pixKey: string | null;
  pixKeyType: string | null;
  accountHolderName: string | null;
  paymentReference: string | null;
  createdAt: string;
  statusHistory: WithdrawalRequestStatusHistoryItem[];
}

export interface AdminFinancialOverview {
  completedDeliveries: {
    count: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    unbilledValue: number;
  };
  invoices: {
    pendingCount: number;
    overdueCount: number;
    totalReceivable: number;
  };
  driverWallets: {
    availableBalance: number;
    blockedBalance: number;
    pendingWithdrawalAmount: number;
  };
}

export interface AdminDriverWalletItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  walletId: string | null;
  availableBalance: number;
  blockedBalance: number;
  pendingWithdrawalAmount: number;
  cacheMatchesLedger: boolean;
}

export interface AdminDriverWalletDetail extends AdminDriverWalletItem {
  transactions: WalletTransactionItem[];
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentMethod = 'BILLED' | 'ONLINE';

export interface InvoiceListItem {
  id: string;
  number: string;
  companyId: string;
  companyName: string;
  issueDate: string;
  dueDate: string;
  paymentDate: string | null;
  paymentMethod: PaymentMethod | null;
  status: InvoiceStatus;
  totalValue: number;
  driverValueSum: number;
  platformValueSum: number;
  deliveryCount: number;
}

/** Uma fatura quitada, como linha do extrato. */
export interface ReceiptItem {
  invoiceId: string;
  invoiceNumber: string;
  companyId: string;
  companyName: string;
  paidAt: string;
  paymentMethod: PaymentMethod | null;
  amount: number;
}

/**
 * Um dia do extrato, com o total já somado.
 *
 * O total vem do servidor e não é somado na tela: dinheiro é `Decimal(10,2)` no
 * banco, e somar float no cliente faz o total exibido divergir do real depois
 * de algumas dezenas de linhas.
 */
export interface ReceiptDayGroup {
  /** `AAAA-MM-DD` no fuso da operação. */
  day: string;
  total: number;
  receipts: ReceiptItem[];
}

export interface ReceiptsReport {
  /** Soma de todos os dias do intervalo. */
  total: number;
  days: ReceiptDayGroup[];
}

export type ReceivablesAgingBucketKey =
  'UNBILLED' | 'NOT_DUE' | 'OVERDUE_1_7' | 'OVERDUE_8_15' | 'OVERDUE_16_30' | 'OVERDUE_31_PLUS';

export interface ReceivablesAgingBucketItem {
  key: ReceivablesAgingBucketKey;
  count: number;
  value: number;
}

/** Exposição financeira atual de uma empresa, sem filtro de período. */
export interface ReceivablesCompanyItem {
  companyId: string;
  companyName: string;
  unbilledCount: number;
  unbilledValue: number;
  oldestUnbilledDate: string | null;
  maxUnbilledDays: number;
  notDueInvoiceCount: number;
  notDueInvoiceValue: number;
  overdueInvoiceCount: number;
  overdueInvoiceValue: number;
  oldestOverdueDate: string | null;
  maxOverdueDays: number;
  totalReceivable: number;
}

/**
 * Contas a receber no instante atual.
 *
 * Não aceita período de propósito: uma dívida antiga continua existindo hoje.
 * `asOf` é a data civil no fuso da operação usada para calcular os atrasos.
 */
export interface ReceivablesAgingReport {
  asOf: string;
  totalReceivable: number;
  totalCompanies: number;
  unbilled: {
    count: number;
    value: number;
  };
  invoices: {
    count: number;
    value: number;
    notDueCount: number;
    notDueValue: number;
    overdueCount: number;
    overdueValue: number;
  };
  buckets: ReceivablesAgingBucketItem[];
  companies: ReceivablesCompanyItem[];
}

export type PayoutAgingBucketKey = 'OPEN_0_1' | 'OPEN_2_3' | 'OPEN_4_7' | 'OPEN_8_PLUS';

export interface PayoutAgingBucketItem {
  key: PayoutAgingBucketKey;
  count: number;
  requestedValue: number;
  netValue: number;
}

export interface DriverPayoutPositionItem {
  driverId: string;
  driverName: string;
  driverEmail: string;
  walletId: string;
  availableBalance: number;
  blockedBalance: number;
  pendingWithdrawalAmount: number;
  totalObligation: number;
  openWithdrawalCount: number;
  openRequestedValue: number;
  openNetValue: number;
  pendingRequestCount: number;
  pendingNetValue: number;
  approvedRequestCount: number;
  approvedNetValue: number;
  oldestOpenDate: string | null;
  maxOpenDays: number;
  cacheMatchesLedger: boolean;
  /** Reservado no ledger menos o valor solicitado em saques abertos. */
  withdrawalLedgerDifference: number;
}

/** Fotografia atual das obrigações financeiras com os entregadores. */
export interface PayoutsAgingReport {
  asOf: string;
  totalObligation: number;
  wallets: {
    driverCount: number;
    availableBalance: number;
    blockedBalance: number;
    pendingWithdrawalAmount: number;
    divergentCount: number;
  };
  withdrawals: {
    openCount: number;
    requestedValue: number;
    netValue: number;
    pendingCount: number;
    pendingNetValue: number;
    approvedCount: number;
    approvedNetValue: number;
    oldestOpenDate: string | null;
    maxOpenDays: number;
    withdrawalLedgerDifference: number;
  };
  buckets: PayoutAgingBucketItem[];
  drivers: DriverPayoutPositionItem[];
}

export interface InvoiceDetail extends InvoiceListItem {
  deliveries: Array<{
    id: string;
    displayNumber: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    completedAt: string;
  }>;
  statusHistory: Array<{
    fromStatus: InvoiceStatus | null;
    toStatus: InvoiceStatus;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
}
