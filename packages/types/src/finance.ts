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
