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

/**
 * Fatura na lista.
 *
 * `issueDate`, `dueDate` e `paymentDate` sao DIAS CIVIS (`AAAA-MM-DD`), nao
 * instantes: no banco sao colunas `date`, sem hora e sem fuso. Serializar
 * com hora fazia quem formatasse no fuso da operacao ver o dia anterior.
 */
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

/** Pedido concluido e faturavel que o admin pode incluir numa fatura manual. */
export interface ManualInvoiceCandidate {
  id: string;
  displayNumber: number;
  externalOrderNumber: string | null;
  completedAt: string;
  serviceTypeName: string;
  totalValue: number;
  driverValue: number;
  platformValue: number;
}

/** Previa calculada pelo servidor com os mesmos valores congelados da emissao. */
export interface ManualInvoicePreview {
  company: {
    id: string;
    tradeName: string;
    document: string;
  };
  issueDate: string;
  dueDate: string;
  deliveryCount: number;
  totalValue: number;
  driverValueSum: number;
  platformValueSum: number;
  deliveries: ManualInvoiceCandidate[];
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

export type FinancialStatementAdjustmentType =
  'CREDIT_ADJUSTMENT' | 'DEBIT_ADJUSTMENT' | 'CREDIT_REFUND';

export interface FinancialStatementTotals {
  completedCount: number;
  pricedCount: number;
  unpricedCount: number;
  totalValue: number;
  driverValue: number;
  platformValue: number;
  averageTicket: number;
  contributionMarginPercent: number;
  reconciliationDifference: number;
}

export interface FinancialStatementDimensionItem extends FinancialStatementTotals {
  id: string;
  name: string;
  platformRevenueSharePercent: number;
}

export interface FinancialStatementPaymentMethodItem extends FinancialStatementTotals {
  paymentMethod: PaymentMethod;
}

export interface FinancialStatementDayItem extends FinancialStatementTotals {
  day: string;
}

export interface FinancialStatementAdjustmentItem {
  type: FinancialStatementAdjustmentType;
  status: WalletTransactionStatus;
  direction: 'CREDIT' | 'DEBIT';
  count: number;
  value: number;
}

/**
 * Demonstrativo gerencial por competência das entregas concluídas.
 *
 * `platformValue` é margem de contribuição antes de despesas operacionais,
 * impostos e ajustes de carteira. Os ajustes são informativos e permanecem
 * separados porque o ledger não possui classificação contábil suficiente para
 * incorporá-los automaticamente ao resultado da plataforma.
 */
export interface FinancialStatementReport {
  period: { from: string; to: string };
  live: boolean;
  totals: FinancialStatementTotals;
  comparison: {
    period: { from: string; to: string };
    totals: FinancialStatementTotals;
    changePercent: {
      completedCount: number | null;
      totalValue: number | null;
      driverValue: number | null;
      platformValue: number | null;
      averageTicket: number | null;
    };
    contributionMarginPercentagePointChange: number;
  };
  walletAdjustments: {
    creditCount: number;
    creditValue: number;
    debitCount: number;
    debitValue: number;
    /** Créditos menos débitos: quanto os ajustes aumentaram a obrigação com entregadores. */
    netDriverObligationImpact: number;
    items: FinancialStatementAdjustmentItem[];
  };
  companies: FinancialStatementDimensionItem[];
  serviceTypes: FinancialStatementDimensionItem[];
  paymentMethods: FinancialStatementPaymentMethodItem[];
  days: FinancialStatementDayItem[];
}

export type FinancialCycleIssue =
  | 'UNPRICED'
  | 'MISSING_DRIVER'
  | 'MISSING_INVOICE'
  | 'CANCELLED_INVOICE'
  | 'PAID_WITHOUT_PAYMENT_DATE'
  | 'UNEXPECTED_INVOICE_FOR_ONLINE'
  | 'MISSING_REPASSE'
  | 'REPASSE_AMOUNT_MISMATCH'
  | 'DUPLICATE_REPASSE'
  | 'CANCELLED_REPASSE';

export interface FinancialCycleRepasseItem {
  transactionId: string;
  status: WalletTransactionStatus;
  amount: number;
  createdAt: string;
  releaseAt: string | null;
}

export interface FinancialCycleDeliveryItem {
  deliveryId: string;
  displayNumber: number;
  completedAt: string;
  company: { id: string; name: string };
  driver: { id: string; name: string } | null;
  serviceType: { id: string; name: string };
  paymentMethod: PaymentMethod;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  invoice: {
    id: string;
    number: string;
    issueDate: string;
    dueDate: string;
    paymentDate: string | null;
    status: InvoiceStatus;
  } | null;
  repasses: FinancialCycleRepasseItem[];
  issues: FinancialCycleIssue[];
}

export interface FinancialCycleAdjustmentItem {
  transactionId: string;
  type: 'CREDIT_ADJUSTMENT' | 'DEBIT_ADJUSTMENT' | 'CREDIT_REFUND';
  status: WalletTransactionStatus;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  reason: string | null;
  createdAt: string;
  driver: { id: string; name: string };
  createdBy: { id: string; name: string } | null;
}

/**
 * Ciclo financeiro de entregas concluídas no período de competência.
 *
 * Fatura, pagamento e repasse refletem o estado atual dessas entregas, mesmo
 * quando ocorreram depois do fim do período. Ajustes são um extrato separado
 * pelo próprio `createdAt`, para não serem atribuídos artificialmente a um
 * pedido ou competência.
 */
export interface FinancialCycleReport {
  period: { from: string; to: string };
  summary: {
    completedCount: number;
    pricedCount: number;
    competencyValue: number;
    invoicedCount: number;
    invoicedDeliveryValue: number;
    unbilledCount: number;
    unbilledValue: number;
    receivedCount: number;
    receivedDeliveryValue: number;
    openInvoiceCount: number;
    openInvoiceValue: number;
    overdueCount: number;
    overdueValue: number;
    onlineCount: number;
    onlineValue: number;
    repasseRegisteredCount: number;
    repasseRegisteredValue: number;
    itemWithIssueCount: number;
    adjustmentCreditValue: number;
    adjustmentDebitValue: number;
  };
  items: FinancialCycleDeliveryItem[];
  adjustments: FinancialCycleAdjustmentItem[];
}

export interface CashFlowForecastInvoiceItem {
  invoiceId: string;
  number: string;
  company: { id: string; name: string };
  status: InvoiceStatus;
  dueDate: string;
  paymentDate: string | null;
  totalValue: number;
}

export interface CashFlowForecastRepasseItem {
  transactionId: string;
  driver: { id: string; name: string };
  delivery: { id: string; displayNumber: number } | null;
  amount: number;
  releaseDate: string | null;
  timing: 'OVERDUE_BEFORE_PERIOD' | 'IN_PERIOD' | 'UNSCHEDULED';
}

export interface CashFlowForecastWithdrawalItem {
  withdrawalId: string;
  driver: { id: string; name: string };
  status: WithdrawalRequestStatus;
  requestedAmount: number;
  netAmount: number;
  createdAt: string;
  paidAt: string | null;
}

export interface CashFlowForecastDayItem {
  day: string;
  projectedInvoiceInflowCount: number;
  projectedInvoiceInflowValue: number;
  scheduledRepasseReleaseCount: number;
  scheduledRepasseReleaseValue: number;
  realizedReceiptCount: number;
  realizedReceiptValue: number;
  realizedWithdrawalCount: number;
  realizedWithdrawalValue: number;
}

/**
 * Agenda financeira conhecida, sem fabricar saldo bancario futuro.
 *
 * Vencimento de fatura e expectativa de entrada; liberacao de repasse e uma
 * obrigacao que se torna sacavel, nao uma transferencia bancaria. Saques em
 * aberto ficam fora dos dias porque o produto ainda nao persiste uma data
 * prometida de pagamento.
 */
export interface CashFlowForecastReport {
  period: { from: string; to: string };
  asOf: string;
  summary: {
    projectedInvoiceCount: number;
    projectedInvoiceValue: number;
    overdueBeforePeriodCount: number;
    overdueBeforePeriodValue: number;
    unbilledCount: number;
    unbilledValue: number;
    scheduledRepasseCount: number;
    scheduledRepasseValue: number;
    overdueRepasseCount: number;
    overdueRepasseValue: number;
    unscheduledRepasseCount: number;
    unscheduledRepasseValue: number;
    openWithdrawalCount: number;
    openWithdrawalRequestedValue: number;
    openWithdrawalNetValue: number;
    approvedWithdrawalCount: number;
    approvedWithdrawalNetValue: number;
    realizedReceiptCount: number;
    realizedReceiptValue: number;
    realizedWithdrawalCount: number;
    realizedWithdrawalValue: number;
  };
  days: CashFlowForecastDayItem[];
  projectedInvoices: CashFlowForecastInvoiceItem[];
  overdueBeforePeriodInvoices: CashFlowForecastInvoiceItem[];
  realizedReceipts: CashFlowForecastInvoiceItem[];
  repasses: CashFlowForecastRepasseItem[];
  openWithdrawals: CashFlowForecastWithdrawalItem[];
  realizedWithdrawals: CashFlowForecastWithdrawalItem[];
}

export interface FinancialAuditActor {
  id: string;
  name: string;
}

export interface FinancialAuditWalletAdjustmentEvent {
  id: string;
  kind: 'WALLET_ADJUSTMENT';
  occurredAt: string;
  actor: FinancialAuditActor | null;
  driver: { id: string; name: string };
  transactionType: 'CREDIT_ADJUSTMENT' | 'DEBIT_ADJUSTMENT' | 'CREDIT_REFUND';
  transactionStatus: WalletTransactionStatus;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  reason: string | null;
}

export interface FinancialAuditInvoiceEvent {
  id: string;
  kind: 'INVOICE_STATUS_CHANGE';
  occurredAt: string;
  actor: FinancialAuditActor | null;
  invoice: {
    id: string;
    number: string;
    totalValue: number;
    company: { id: string; name: string };
  };
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  note: string | null;
}

export interface FinancialAuditWithdrawalEvent {
  id: string;
  kind: 'WITHDRAWAL_STATUS_CHANGE';
  occurredAt: string;
  actor: FinancialAuditActor | null;
  withdrawal: {
    id: string;
    requestedAmount: number;
    netAmount: number;
    driver: { id: string; name: string };
  };
  fromStatus: WithdrawalRequestStatus | null;
  toStatus: WithdrawalRequestStatus;
  note: string | null;
}

export type FinancialAuditEvent =
  FinancialAuditWalletAdjustmentEvent | FinancialAuditInvoiceEvent | FinancialAuditWithdrawalEvent;

/** Linha do tempo auditavel das trilhas financeiras ja persistidas. */
export interface FinancialAuditReport {
  period: { from: string; to: string };
  summary: {
    totalEventCount: number;
    identifiedActorCount: number;
    systemEventCount: number;
    walletAdjustmentCount: number;
    walletCreditValue: number;
    walletDebitValue: number;
    invoiceStatusChangeCount: number;
    invoicePaidCount: number;
    invoicePaidValue: number;
    withdrawalStatusChangeCount: number;
    withdrawalPaidCount: number;
    withdrawalPaidValue: number;
  };
  events: FinancialAuditEvent[];
}

/**
 * Posição financeira da EMPRESA — o outro lado do `CashPositionItem` do admin.
 *
 * Responde "quanto eu devo hoje", que é a pergunta que a loja não conseguia
 * fazer: a lista de faturas mostrava uma a uma e ninguém somava.
 */
export interface CompanyFinancialPosition {
  /** Faturas emitidas com vencimento ainda no futuro. */
  notDue: { count: number; value: number };
  /** Faturas que passaram do vencimento. `maxOverdueDays` é a mais antiga. */
  overdue: { count: number; value: number; maxOverdueDays: number };
  /**
   * Pedidos concluídos que ainda não entraram em fatura.
   *
   * É o número que a loja não tinha: ela só descobria o valor na segunda,
   * quando o fechamento rodava.
   */
  unbilled: { count: number; value: number };
  totalOpen: number;
  /** Proximo corte automatico; nulo quando o fechamento e manual. */
  nextClosingDate: string | null;
}

/**
 * Quanto a loja gastou num periodo, e como isso se compara com o anterior.
 *
 * Tudo agregado no servidor. A tela de indicadores somava no navegador, o que
 * exigia baixar a lista inteira de entregas so para calcular uma media.
 */
export interface CompanyPeriodTotals {
  count: number;
  completed: number;
  cancelled: number;
  value: number;
  /** So o que foi concluido. E o que a loja de fato vai pagar. */
  completedValue: number;
  averageTicket: number;
}

export interface CompanyFinancialSummary {
  from: string;
  to: string;
  current: CompanyPeriodTotals;
  /** Mesmo numero de dias, imediatamente antes. Nulo se nao houve movimento. */
  previous: CompanyPeriodTotals | null;
  /** Modalidade mais usada no periodo, com quantos pedidos. */
  topServiceType: { name: string; count: number } | null;
  /** Serie diaria, ja no fuso da operacao. */
  daily: Array<{ date: string; count: number; value: number }>;
  /** Quantos pedidos em cada status. Status ausente vale zero. */
  byStatus: Record<string, number>;
  /** Pedidos que exigem retorno a loja. */
  requiresReturnCount: number;
}

export type PaymentNoticeStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

/**
 * Aviso da loja de que pagou uma fatura.
 *
 * NAO e a baixa. `status` aqui e o do AVISO, nao o da fatura: um aviso
 * confirmado significa que o admin conferiu e ai sim marcou a fatura como
 * paga, pelo caminho de sempre.
 */
export interface PaymentNotice {
  id: string;
  invoiceId: string;
  amount: number;
  /** Dia civil informado pela loja, `AAAA-MM-DD`. */
  paidAt: string;
  note: string | null;
  status: PaymentNoticeStatus;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/** Um aviso na fila do admin, com o que ele precisa para decidir. */
export interface PaymentNoticeQueueItem extends PaymentNotice {
  invoiceNumber: string;
  invoiceTotalValue: number;
  invoiceStatus: InvoiceStatus;
  companyId: string;
  companyName: string;
  /**
   * Diferenca entre o que a loja diz ter pago e o total da fatura.
   *
   * Positivo = pagou a mais; negativo = falta. Vem calculado do servidor para
   * a fila e o detalhe nunca discordarem.
   */
  difference: number;
}

/**
 * Um pedido concluido que ainda nao entrou em fatura.
 *
 * E a linha por tras do cartao "ainda nao faturado": o total sozinho diz
 * quanto, e a loja tambem precisa saber do que.
 */
export interface CompanyUnbilledDelivery {
  id: string;
  displayNumber: number;
  completedAt: string;
  dropoffAddress: string;
  serviceTypeName: string | null;
  totalValue: number;
}

export interface CompanyUnbilledDeliveries {
  items: CompanyUnbilledDelivery[];
  count: number;
  total: number;
  /** Proximo corte automatico; nulo quando o admin fecha manualmente. */
  closingDate: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  deliveries: Array<{
    id: string;
    displayNumber: number;
    totalValue: number;
    driverValue: number;
    platformValue: number;
    completedAt: string;
    /**
     * Valor do retorno ao local de coleta, quando o pedido exige um.
     *
     * Vai 100% para o motoboy, sem comissao da plataforma — e por isso que um
     * pedido com retorno aparece com o dobro do total e a MESMA comissao dos
     * outros. Sem este campo, a linha parece anomalia na fatura.
     */
    returnValue: number | null;
  }>;
  statusHistory: Array<{
    fromStatus: InvoiceStatus | null;
    toStatus: InvoiceStatus;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
}

/** Fatura visível pela empresa, sem repasse ou margem interna da plataforma. */
export type CompanyInvoiceListItem = Omit<InvoiceListItem, 'driverValueSum' | 'platformValueSum'>;

export interface CompanyInvoiceDetail extends CompanyInvoiceListItem {
  deliveries: Array<{
    id: string;
    displayNumber: number;
    totalValue: number;
    completedAt: string;
  }>;
  statusHistory: InvoiceDetail['statusHistory'];
}
