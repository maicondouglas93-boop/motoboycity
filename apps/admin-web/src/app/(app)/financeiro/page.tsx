'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { adminFinancialApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export default function FinancePage() {
  const token = session.getToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  const [walletSearch, setWalletSearch] = useState('');
  const [appliedWalletSearch, setAppliedWalletSearch] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['admin', 'financial', 'overview', appliedPeriod],
    queryFn: () => adminFinancialApi.overview(token as string, appliedPeriod),
    enabled: Boolean(token),
  });
  const walletsQuery = useQuery({
    queryKey: ['admin', 'financial', 'driver-wallets', appliedWalletSearch],
    queryFn: () =>
      adminFinancialApi.listDriverWallets(token as string, {
        ...(appliedWalletSearch && { search: appliedWalletSearch }),
      }),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver o financeiro.
      </p>
    );
  }

  const overview = overviewQuery.data;
  const wallets = walletsQuery.data ?? [];

  function applyPeriod() {
    if (from && to && from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setPeriodError(null);
    setAppliedPeriod({ ...(from && { from }), ...(to && { to }) });
  }

  function clearPeriod() {
    setFrom('');
    setTo('');
    setPeriodError(null);
    setAppliedPeriod({});
  }

  function clearWalletSearch() {
    setWalletSearch('');
    setAppliedWalletSearch('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Visão calculada a partir dos pedidos concluídos, faturas e lançamentos do ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="finance-from">Conclusão a partir de</Label>
            <Input
              id="finance-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finance-to">Conclusão até</Label>
            <Input
              id="finance-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={applyPeriod}>Aplicar período</Button>
          <Button variant="outline" onClick={clearPeriod}>
            Limpar
          </Button>
          {periodError && <p className="text-sm text-destructive">{periodError}</p>}
        </div>
      </div>

      {overviewQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Calculando financeiro...</p>
      )}
      {overviewQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" />
          Não foi possível carregar o resumo financeiro. Tente novamente.
        </div>
      )}

      {overview && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Entregas concluídas no período
            </h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
              <StatCard label="Entregas" value={String(overview.completedDeliveries.count)} />
              <StatCard
                label="Valor total"
                value={formatCurrency(overview.completedDeliveries.totalValue)}
              />
              <StatCard
                label="Repasse aos entregadores"
                value={formatCurrency(overview.completedDeliveries.driverValue)}
              />
              <StatCard
                label="Receita da plataforma"
                value={formatCurrency(overview.completedDeliveries.platformValue)}
              />
              <StatCard
                label="Concluído sem fatura"
                value={formatCurrency(overview.completedDeliveries.unbilledValue)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Faturas e carteira</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
              <StatCard label="Faturas pendentes" value={String(overview.invoices.pendingCount)} />
              <StatCard label="Faturas vencidas" value={String(overview.invoices.overdueCount)} />
              <StatCard
                label="Total a receber"
                value={formatCurrency(overview.invoices.totalReceivable)}
              />
              <StatCard
                label="Saldo disponível dos entregadores"
                value={formatCurrency(overview.driverWallets.availableBalance)}
              />
              <StatCard
                label="Saldo a liberar dos entregadores"
                value={formatCurrency(overview.driverWallets.blockedBalance)}
              />
            </div>
          </section>
        </>
      )}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Carteiras dos entregadores</CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              Saldos calculados do ledger; “a liberar” não está disponível para saque.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              href="/financeiro/saques"
            >
              Gerenciar saques
            </Link>
            <Input
              aria-label="Buscar entregador"
              className="w-64"
              placeholder="Nome ou e-mail"
              value={walletSearch}
              onChange={(event) => setWalletSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setAppliedWalletSearch(walletSearch.trim());
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAppliedWalletSearch(walletSearch.trim())}
            >
              <Search className="size-4" />
              <span className="sr-only">Buscar</span>
            </Button>
            <Button variant="outline" onClick={clearWalletSearch}>
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {walletsQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando carteiras...</p>
          ) : walletsQuery.isError ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar as carteiras.</p>
          ) : wallets.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum entregador encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Saldo disponível</TableHead>
                  <TableHead>Saldo a liberar</TableHead>
                  <TableHead>Saques pendentes</TableHead>
                  <TableHead>Conferência</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((wallet) => (
                  <TableRow key={wallet.driverId}>
                    <TableCell>
                      <p className="font-medium">{wallet.driverName}</p>
                      <p className="text-xs text-muted-foreground">{wallet.driverEmail}</p>
                    </TableCell>
                    <TableCell>{formatCurrency(wallet.availableBalance)}</TableCell>
                    <TableCell>{formatCurrency(wallet.blockedBalance)}</TableCell>
                    <TableCell>{formatCurrency(wallet.pendingWithdrawalAmount)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          wallet.cacheMatchesLedger ? 'text-status-entregue' : 'text-destructive'
                        }
                      >
                        {wallet.cacheMatchesLedger ? 'Conferido' : 'Divergência'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                        href={`/entregadores/${wallet.driverId}`}
                      >
                        Ver entregador
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
