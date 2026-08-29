'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, WalletTransactionStatus } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowUpRight,
  Bike,
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  MapPin,
  RotateCcw,
  WalletCards,
} from 'lucide-react';
import { ChangePasswordDialog } from '@/components/users/change-password-dialog';
import { DriverDocumentsManager, EditDriverDialog } from '@/components/drivers/driver-maintenance';
import { DriverPunishments } from '@/components/drivers/driver-punishments';
import { DriverCompanyBlocks } from '@/components/drivers/driver-company-blocks';
import { StatusChip, STATUS_OPTIONS, statusRailClass } from '@/components/orders/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryState } from '@/components/ui/query-state';
import { StatCard } from '@/components/stat-card';
import { adminDriversApi, adminFinancialApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const walletStatusLabel: Record<WalletTransactionStatus, string> = {
  PENDING: 'A liberar',
  RELEASED: 'Liberado',
  CANCELLED: 'Cancelado',
};

const walletTypeLabel: Record<string, string> = {
  CREDIT_REPASSE: 'Repasse de entrega',
  DEBIT_WITHDRAWAL: 'Saque',
  DEBIT_FEE: 'Tarifa',
  CREDIT_ADVANCE_RELEASE: 'Antecipação liberada',
  CREDIT_ADJUSTMENT: 'Ajuste de crédito',
  DEBIT_ADJUSTMENT: 'Ajuste de débito',
  CREDIT_REFUND: 'Estorno',
};

const approvalLabel: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
};

const accountLabel: Record<string, string> = {
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  BLOCKED: 'Bloqueada',
};

const ORDER_PAGE_SIZES = [10, 25, 50] as const;

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const money = useMoney();
  const { id: driverId } = use(params);
  const token = session.getToken();
  const [orderStatus, setOrderStatus] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState<number>(ORDER_PAGE_SIZES[0]);
  const [walletStatus, setWalletStatus] = useState<WalletTransactionStatus | 'ALL'>('ALL');
  const [walletFrom, setWalletFrom] = useState('');
  const [walletTo, setWalletTo] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [appliedWalletFilters, setAppliedWalletFilters] = useState<{
    status?: WalletTransactionStatus;
    from?: string;
    to?: string;
  }>({});

  const driverQuery = useQuery({
    queryKey: ['admin', 'driver', driverId],
    queryFn: () => adminDriversApi.detail(token as string, driverId),
    enabled: Boolean(token),
  });
  const walletQuery = useQuery({
    queryKey: ['admin', 'driver-wallet', driverId, appliedWalletFilters],
    queryFn: () =>
      adminFinancialApi.getDriverWallet(token as string, driverId, appliedWalletFilters),
    enabled: Boolean(token),
  });
  const deliverySummaryQuery = useQuery({
    queryKey: ['admin', 'driver-deliveries', 'summary', driverId],
    queryFn: () => deliveriesApi.summary(token as string, { driverId }),
    enabled: Boolean(token),
  });
  const ordersQuery = useQuery({
    queryKey: [
      'admin',
      'driver-deliveries',
      'paged',
      driverId,
      orderStatus,
      orderPage,
      orderPageSize,
    ],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        driverId,
        ...(orderStatus !== 'ALL' && { status: orderStatus }),
        page: orderPage,
        pageSize: orderPageSize,
      }),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o detalhe do entregador.
      </p>
    );
  }

  const driver = driverQuery.data;
  const wallet = walletQuery.data;
  const deliverySummary = deliverySummaryQuery.data;
  const orders = ordersQuery.data?.items ?? [];
  const totalOrders = ordersQuery.data?.total ?? 0;
  const totalOrderPages = Math.max(1, Math.ceil(totalOrders / orderPageSize));
  const firstVisibleOrder = totalOrders === 0 ? 0 : (orderPage - 1) * orderPageSize + 1;
  const lastVisibleOrder = Math.min(orderPage * orderPageSize, totalOrders);

  return (
    <div className="space-y-6">
      <Link
        href="/entregadores"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Voltar para entregadores
      </Link>

      {driverQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando entregador...</p>
      )}
      {driverQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar este entregador.
        </div>
      )}

      {passwordChanged && (
        <div className="rounded-2xl border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
          Senha alterada. As sessões anteriores deste entregador foram encerradas.
        </div>
      )}

      {driver && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{driver.name}</h1>
              <p className="text-sm text-muted-foreground">
                {driver.email} · {driver.phone}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant={driver.approvalStatus === 'APPROVED' ? 'default' : 'outline'}>
                  Cadastro {approvalLabel[driver.approvalStatus] ?? driver.approvalStatus}
                </Badge>
                <Badge variant={driver.accountStatus === 'ACTIVE' ? 'secondary' : 'destructive'}>
                  Conta {accountLabel[driver.accountStatus] ?? driver.accountStatus}
                </Badge>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <EditDriverDialog driver={driver} token={token} />
                <ChangePasswordDialog
                  targetName={driver.name}
                  targetEmail={driver.email}
                  changePassword={(password) =>
                    adminDriversApi.changePassword(token, driver.id, { password })
                  }
                  onChanged={() => setPasswordChanged(true)}
                >
                  <Button variant="outline" size="sm">
                    <KeyRound className="size-3.5" /> Alterar senha
                  </Button>
                </ChangePasswordDialog>
              </div>
            </div>
          </header>

          <DriverPunishments driverId={driver.id} token={token} />
          <DriverCompanyBlocks driverId={driver.id} token={token} />

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Saldo disponível"
              value={wallet ? money(wallet.availableBalance) : '—'}
            />
            <StatCard label="Saldo a liberar" value={wallet ? money(wallet.blockedBalance) : '—'} />
            <StatCard
              label="Pedidos concluídos"
              value={deliverySummary ? String(deliverySummary.counts.COMPLETED ?? 0) : '—'}
            />
            <StatCard
              label="Repasse concluído"
              value={deliverySummary ? money(deliverySummary.completedDriverValue) : '—'}
            />
          </section>

          {deliverySummaryQuery.isError && (
            <QueryState
              compact
              kind="error"
              title="Resumo dos pedidos indisponível"
              description="Os indicadores foram ocultados para não parecerem zerados por engano."
              onAction={() => void deliverySummaryQuery.refetch()}
            />
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Cadastro e operação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">CPF</p>
                  <p>{driver.cpf}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nascimento</p>
                  <p>{driver.birthDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Regiao</p>
                  <p>{driver.region.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chave PIX</p>
                  <p>
                    {driver.pixKeyType} · {driver.pixKey}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cadastrado em</p>
                  <p>{formatDate(driver.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Revisão</p>
                  <p>
                    {driver.reviewedBy
                      ? `${driver.reviewedBy.name} · ${formatDate(driver.reviewedAt)}`
                      : 'Ainda não revisado'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-muted-foreground">Modalidades qualificadas</p>
                  <div className="flex flex-wrap gap-1">
                    {driver.serviceTypes.length === 0 ? (
                      <span className="text-alerta">Nenhuma modalidade atribuída.</span>
                    ) : (
                      driver.serviceTypes.map((serviceType) => (
                        <Badge
                          key={serviceType.id}
                          variant={serviceType.isPrimary ? 'default' : 'secondary'}
                        >
                          {serviceType.name}
                          {serviceType.isPrimary ? ' · principal' : ''}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Indicadores dos pedidos vinculados</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Total"
                  value={deliverySummary ? String(deliverySummary.totalCount) : '—'}
                />
                <StatCard
                  label="Concluídos"
                  value={deliverySummary ? String(deliverySummary.counts.COMPLETED ?? 0) : '—'}
                />
                <StatCard
                  label="Cancelados"
                  value={deliverySummary ? String(deliverySummary.counts.CANCELLED ?? 0) : '—'}
                />
                <StatCard
                  label="Conferência do ledger"
                  value={
                    wallet
                      ? wallet.cacheMatchesLedger === false
                        ? 'Divergência'
                        : 'Conferido'
                      : '—'
                  }
                />
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Documentos do entregador</CardTitle>
            </CardHeader>
            <CardContent>
              <DriverDocumentsManager driver={driver} token={token} />
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pedidos do entregador</h2>
                <p className="text-sm text-muted-foreground">
                  Dados reais vinculados a este cadastro.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar status dos pedidos"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={orderStatus}
                  onChange={(event) => {
                    setOrderStatus(event.target.value as DeliveryStatus | 'ALL');
                    setOrderPage(1);
                  }}
                >
                  <option value="ALL">Todos os status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Pedidos por página"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={orderPageSize}
                  onChange={(event) => {
                    setOrderPageSize(Number(event.target.value));
                    setOrderPage(1);
                  }}
                >
                  {ORDER_PAGE_SIZES.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize} por página
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {ordersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
            ) : ordersQuery.isError ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar os pedidos deste entregador.
              </p>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido neste filtro.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div
                  className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-7"
                  aria-busy={ordersQuery.isFetching}
                >
                  {orders.map((delivery) => (
                    <Card
                      key={delivery.id}
                      size="sm"
                      className="h-full min-w-0 border-primary/15 bg-gradient-to-br from-card via-card to-admin-soft/35"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-1 ${statusRailClass(delivery.status)}`}
                      />
                      <CardContent className="flex h-full min-w-0 flex-col gap-3 pl-4">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <span className="rounded-md bg-admin-soft px-2 py-1 text-[11px] font-bold tracking-wide text-admin-deep">
                            #{delivery.displayNumber}
                          </span>
                          <StatusChip
                            status={delivery.status}
                            className="max-w-full px-2 py-1 text-[10px]"
                          />
                        </div>

                        <div className="min-w-0 space-y-1">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                            <Building2 className="size-3 text-primary" aria-hidden="true" /> Empresa
                          </p>
                          <p
                            className="truncate text-sm font-semibold text-admin-deep"
                            title={delivery.companyName}
                          >
                            {delivery.companyName}
                          </p>
                        </div>

                        <div className="space-y-2 border-y border-primary/10 py-3 text-xs text-muted-foreground">
                          <p className="flex min-w-0 items-center gap-2">
                            <Bike className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate" title={delivery.serviceTypeName}>
                              {delivery.serviceTypeName}
                            </span>
                          </p>
                          <p className="flex items-center gap-2">
                            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            {delivery.distanceKm === null
                              ? 'Distância pendente'
                              : `${delivery.distanceKm} km`}
                          </p>
                          {delivery.requiresReturn && (
                            <p className="flex items-center gap-2 font-medium text-primary">
                              <RotateCcw
                                className="size-3.5 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              Com retorno
                            </p>
                          )}
                        </div>

                        <div className="mt-auto rounded-xl bg-admin-soft/70 p-2.5 ring-1 ring-inset ring-primary/10">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                            <WalletCards className="size-3 text-primary" aria-hidden="true" />{' '}
                            Repasse
                          </p>
                          <p className="mt-1 text-sm font-bold text-admin-deep">
                            {money(delivery.driverValue)}
                          </p>
                        </div>

                        <Link
                          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border border-primary/15 bg-card px-2 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-admin-soft"
                          href={`/pedidos/${delivery.id}`}
                        >
                          Ver detalhes
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-sm">
                  <p className="text-muted-foreground" aria-live="polite">
                    Mostrando {firstVisibleOrder}–{lastVisibleOrder} de {totalOrders} pedidos
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setOrderPage((current) => Math.max(1, current - 1))}
                      disabled={orderPage <= 1 || ordersQuery.isFetching}
                    >
                      <ChevronLeft data-icon="inline-start" aria-hidden="true" />
                      Anterior
                    </Button>
                    <span className="min-w-24 text-center text-xs font-medium text-admin-deep">
                      Página {orderPage} de {totalOrderPages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setOrderPage((current) => Math.min(totalOrderPages, current + 1))
                      }
                      disabled={orderPage >= totalOrderPages || ordersQuery.isFetching}
                    >
                      Próxima
                      <ChevronRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Extrato da carteira</h2>
              <p className="text-sm text-muted-foreground">
                Ledger imutável. Valores “a liberar” ainda não são saldo disponível.
              </p>
            </div>
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 py-4">
                <div className="space-y-1">
                  <Label htmlFor="wallet-status">Status</Label>
                  <select
                    id="wallet-status"
                    className="block h-9 rounded-md border bg-background px-3 text-sm"
                    value={walletStatus}
                    onChange={(event) =>
                      setWalletStatus(event.target.value as WalletTransactionStatus | 'ALL')
                    }
                  >
                    <option value="ALL">Todos</option>
                    {Object.entries(walletStatusLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wallet-from">A partir de</Label>
                  <Input
                    id="wallet-from"
                    type="date"
                    value={walletFrom}
                    onChange={(event) => setWalletFrom(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wallet-to">Até</Label>
                  <Input
                    id="wallet-to"
                    type="date"
                    value={walletTo}
                    onChange={(event) => setWalletTo(event.target.value)}
                  />
                </div>
                <Button
                  onClick={() =>
                    setAppliedWalletFilters({
                      ...(walletStatus !== 'ALL' && { status: walletStatus }),
                      ...(walletFrom && { from: walletFrom }),
                      ...(walletTo && { to: walletTo }),
                    })
                  }
                >
                  Aplicar filtros
                </Button>
              </CardContent>
            </Card>
            {walletQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando extrato...</p>
            ) : walletQuery.isError ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar o extrato desta carteira.
              </p>
            ) : !wallet || wallet.transactions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lançamento neste filtro.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {wallet.transactions.map((transaction) => (
                  <Card key={transaction.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {walletTypeLabel[transaction.type] ?? transaction.type}
                        </p>
                        <p className="text-muted-foreground">
                          {formatDate(transaction.createdAt)}
                          {transaction.releaseAt
                            ? ` · previsto: ${formatDate(transaction.releaseAt)}`
                            : ''}
                        </p>
                        {transaction.relatedDelivery && (
                          <Link
                            className="text-xs text-primary underline-offset-4 hover:underline"
                            href={`/pedidos/${transaction.relatedDelivery.id}`}
                          >
                            Pedido #{transaction.relatedDelivery.displayNumber} ·{' '}
                            {transaction.relatedDelivery.companyName}
                          </Link>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={transaction.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                        >
                          {walletStatusLabel[transaction.status]}
                        </Badge>
                        <p
                          className={
                            transaction.direction === 'CREDIT'
                              ? 'mt-1 font-medium text-status-entregue'
                              : 'mt-1 font-medium text-destructive'
                          }
                        >
                          {transaction.direction === 'CREDIT' ? '+' : '−'}{' '}
                          {money(transaction.amount)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
