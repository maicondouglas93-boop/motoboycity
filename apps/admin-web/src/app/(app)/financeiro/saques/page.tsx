'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WithdrawalRequestStatus } from '@motoboycity/types';
import { AlertCircle, ChevronLeft, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { adminFinancialApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const statusLabel: Record<WithdrawalRequestStatus, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  REJECTED: 'Rejeitado',
};

function statusVariant(
  status: WithdrawalRequestStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'PAID' || status === 'APPROVED') return 'default';
  if (status === 'REJECTED') return 'destructive';
  return 'secondary';
}

type Filters = {
  status?: WithdrawalRequestStatus;
  search?: string;
  from?: string;
  to?: string;
};

export default function WithdrawalRequestsPage() {
  const money = useMoney();
  const token = session.getToken();
  const [status, setStatus] = useState<WithdrawalRequestStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [filterError, setFilterError] = useState<string | null>(null);

  const withdrawalsQuery = useQuery({
    queryKey: ['admin', 'financial', 'withdrawals', filters],
    queryFn: () => adminFinancialApi.listWithdrawals(token as string, filters),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os saques.
      </p>
    );
  }

  function applyFilters() {
    if (from && to && from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setFilters({
      ...(status !== 'ALL' && { status }),
      ...(search.trim() && { search: search.trim() }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  function clearFilters() {
    setStatus('ALL');
    setSearch('');
    setFrom('');
    setTo('');
    setFilterError(null);
    setFilters({});
  }

  const withdrawals = withdrawalsQuery.data ?? [];
  const pendingTotal = withdrawals
    .filter((withdrawal) => withdrawal.status === 'PENDING' || withdrawal.status === 'APPROVED')
    .reduce((sum, withdrawal) => sum + withdrawal.netAmount, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/financeiro"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Voltar ao financeiro
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Fila de saques</h1>
          <p className="text-sm text-muted-foreground">
            Solicitações de segunda-feira, sem tarifa. Acesse cada item para aprovar, rejeitar ou
            registrar o pagamento com trilha de auditoria.
          </p>
        </div>
        <Card className="min-w-52">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Aguardando ação neste resultado</p>
            <p className="text-lg font-semibold">{money(pendingTotal)}</p>
          </CardContent>
        </Card>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="withdrawal-status">Status</Label>
            <select
              id="withdrawal-status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as WithdrawalRequestStatus | 'ALL')}
            >
              <option value="ALL">Todos</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="withdrawal-search">Entregador</Label>
            <div className="flex gap-2">
              <Input
                id="withdrawal-search"
                className="w-64"
                placeholder="Nome ou e-mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyFilters();
                }}
              />
              <Button variant="outline" size="icon" onClick={applyFilters}>
                <Search className="size-4" />
                <span className="sr-only">Buscar</span>
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="withdrawal-from">Solicitado a partir de</Label>
            <Input
              id="withdrawal-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="withdrawal-to">Solicitado até</Label>
            <Input
              id="withdrawal-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button onClick={applyFilters}>Aplicar filtros</Button>
          <Button variant="outline" onClick={clearFilters}>
            Limpar
          </Button>
          {filterError && <p className="basis-full text-sm text-destructive">{filterError}</p>}
        </CardContent>
      </Card>

      {withdrawalsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando solicitações de saque...</p>
      ) : withdrawalsQuery.isError ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar os saques. Tente novamente.
        </div>
      ) : withdrawals.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma solicitação neste filtro.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitação</TableHead>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Destino PIX</TableHead>
                  <TableHead>Valor líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <p>{dateFormatter.format(new Date(withdrawal.createdAt))}</p>
                      <p className="text-xs text-muted-foreground">
                        Taxa: {money(withdrawal.feeAmount)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{withdrawal.driver.name}</p>
                      <p className="text-xs text-muted-foreground">{withdrawal.driver.email}</p>
                    </TableCell>
                    <TableCell>
                      <p>{withdrawal.pixKey ?? 'Não informado'}</p>
                      <p className="text-xs text-muted-foreground">
                        {withdrawal.pixKeyType ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell>{money(withdrawal.netAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(withdrawal.status)}>
                        {statusLabel[withdrawal.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                        href={`/financeiro/saques/${withdrawal.id}`}
                      >
                        Ver detalhes
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
