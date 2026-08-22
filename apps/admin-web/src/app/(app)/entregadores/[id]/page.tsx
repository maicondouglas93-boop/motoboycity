'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus, WalletTransactionStatus } from '@motoboycity/types';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { StatusChip, STATUS_OPTIONS } from '@/components/orders/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/stat-card';
import { adminDriversApi, adminFinancialApi, deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
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

function formatCurrency(value: number | null): string {
  return value === null ? 'A calcular na entrega' : currencyFormatter.format(value);
}

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: driverId } = use(params);
  const token = session.getToken();
  const [orderStatus, setOrderStatus] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [walletStatus, setWalletStatus] = useState<WalletTransactionStatus | 'ALL'>('ALL');
  const [walletFrom, setWalletFrom] = useState('');
  const [walletTo, setWalletTo] = useState('');
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
  const allOrdersQuery = useQuery({
    queryKey: ['admin', 'driver-deliveries', driverId],
    queryFn: () => deliveriesApi.list(token as string, { driverId }),
    enabled: Boolean(token),
  });
  const ordersQuery = useQuery({
    queryKey: ['admin', 'driver-deliveries', driverId, orderStatus],
    queryFn: () =>
      deliveriesApi.list(token as string, {
        driverId,
        ...(orderStatus !== 'ALL' && { status: orderStatus }),
      }),
    enabled: Boolean(token),
  });

  const deliveryStats = useMemo(() => {
    const deliveries = allOrdersQuery.data ?? [];
    const completed = deliveries.filter((delivery) => delivery.status === 'COMPLETED');
    return {
      total: deliveries.length,
      completed: completed.length,
      cancelled: deliveries.filter((delivery) => delivery.status === 'CANCELLED').length,
      repasse: completed.reduce((sum, delivery) => sum + (delivery.driverValue ?? 0), 0),
    };
  }, [allOrdersQuery.data]);

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o detalhe do entregador.
      </p>
    );
  }

  const driver = driverQuery.data;
  const wallet = walletQuery.data;
  const orders = ordersQuery.data ?? [];

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

      {driver && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{driver.name}</h1>
              <p className="text-sm text-muted-foreground">
                {driver.email} · {driver.phone}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={driver.approvalStatus === 'APPROVED' ? 'default' : 'outline'}>
                Cadastro {approvalLabel[driver.approvalStatus] ?? driver.approvalStatus}
              </Badge>
              <Badge variant={driver.accountStatus === 'ACTIVE' ? 'secondary' : 'destructive'}>
                Conta {accountLabel[driver.accountStatus] ?? driver.accountStatus}
              </Badge>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Saldo disponível"
              value={formatCurrency(wallet?.availableBalance ?? 0)}
            />
            <StatCard label="Saldo a liberar" value={formatCurrency(wallet?.blockedBalance ?? 0)} />
            <StatCard label="Pedidos concluídos" value={String(deliveryStats.completed)} />
            <StatCard label="Repasse concluído" value={formatCurrency(deliveryStats.repasse)} />
          </section>

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
                <StatCard label="Total" value={String(deliveryStats.total)} />
                <StatCard label="Concluídos" value={String(deliveryStats.completed)} />
                <StatCard label="Cancelados" value={String(deliveryStats.cancelled)} />
                <StatCard
                  label="Conferência do ledger"
                  value={wallet?.cacheMatchesLedger === false ? 'Divergência' : 'Conferido'}
                />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pedidos do entregador</h2>
                <p className="text-sm text-muted-foreground">
                  Dados reais vinculados a este cadastro.
                </p>
              </div>
              <select
                aria-label="Filtrar status dos pedidos"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={orderStatus}
                onChange={(event) => setOrderStatus(event.target.value as DeliveryStatus | 'ALL')}
              >
                <option value="ALL">Todos os status</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              <div className="space-y-2">
                {orders.map((delivery) => (
                  <Card key={delivery.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">
                          #{delivery.displayNumber} · {delivery.companyName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.serviceTypeName} ·{' '}
                          {delivery.distanceKm === null
                            ? 'distância não calculada'
                            : `${delivery.distanceKm} km`}
                          {delivery.requiresReturn ? ' · com retorno' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <StatusChip status={delivery.status} />
                          <p className="mt-1 text-sm font-medium">
                            Repasse: {formatCurrency(delivery.driverValue)}
                          </p>
                        </div>
                        <Link
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                          href={`/pedidos/${delivery.id}`}
                        >
                          Ver detalhes
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
                          {formatCurrency(transaction.amount)}
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
