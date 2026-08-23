'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { Download } from 'lucide-react';
import { StatusChip, statusLabel } from '@/components/orders/status-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { adminCompaniesApi, adminDriversApi, deliveriesApi } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { session } from '@/lib/session';
import { useMoney } from '@/lib/money';

const STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
  'AWAITING_PAYMENT',
];

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Número no formato que o Excel brasileiro entende: vírgula decimal e sem
 * símbolo de moeda. Com "R$" na célula, a planilha trata como texto e nenhuma
 * soma funciona do outro lado.
 */
function csvNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

export default function DeliveryHistoryPage() {
  const money = useMoney();
  const token = session.getToken();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [applied, setApplied] = useState<{
    from?: string;
    to?: string;
    status?: DeliveryStatus;
    companyId?: string;
    driverId?: string;
  }>({});
  const [periodError, setPeriodError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => adminCompaniesApi.list(token as string),
    enabled: Boolean(token),
  });
  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token),
  });
  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'delivery-history', applied],
    queryFn: () => deliveriesApi.list(token as string, applied),
    enabled: Boolean(token),
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login como administrador.</p>;
  }

  function apply() {
    if (from && to && from > to) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setPeriodError(null);
    setApplied({
      ...(from && { from }),
      ...(to && { to }),
      ...(status && { status }),
      ...(companyId && { companyId }),
      ...(driverId && { driverId }),
    });
  }

  function clear() {
    setFrom('');
    setTo('');
    setStatus('');
    setCompanyId('');
    setDriverId('');
    setPeriodError(null);
    setApplied({});
  }

  const deliveries = deliveriesQuery.data ?? [];

  function exportCsv() {
    const csv = toCsv(
      [
        'Pedido',
        'Nº externo',
        'Empresa',
        'Modalidade',
        'Status',
        'Criado em',
        'Último status em',
        'Distância (km)',
        'Total',
        'Entregador',
        'Plataforma',
        'Retorno',
        'Taxa adicional',
        'Valor da taxa',
      ],
      deliveries.map((delivery) => [
        delivery.displayNumber,
        delivery.externalOrderNumber ?? '',
        delivery.companyName,
        delivery.serviceTypeName,
        statusLabel(delivery.status),
        dateTime.format(new Date(delivery.createdAt)),
        dateTime.format(new Date(delivery.statusChangedAt)),
        csvNumber(delivery.distanceKm),
        csvNumber(delivery.totalValue),
        csvNumber(delivery.driverValue),
        csvNumber(delivery.platformValue),
        csvNumber(delivery.returnValue),
        delivery.surchargeLabel ?? '',
        csvNumber(delivery.surchargeValue),
      ]),
    );
    const periodo =
      applied.from || applied.to ? `-${applied.from ?? 'inicio'}-a-${applied.to ?? 'hoje'}` : '';
    downloadCsv(`entregas${periodo}.csv`, csv);
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/relatorios" className="text-sm text-muted-foreground underline">
          ← Relatórios
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Histórico de entregas</h1>
        <p className="text-sm text-muted-foreground">
          Toda entrega do período, com os valores congelados na criação. Serve para conferir com o
          cliente ou fechar o mês.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="history-from">A partir de</Label>
            <Input
              id="history-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-to">Até</Label>
            <Input
              id="history-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-status">Status</Label>
            <select
              id="history-status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as DeliveryStatus | '')}
            >
              <option value="">Todos</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-company">Empresa</Label>
            <select
              id="history-company"
              className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">Todas</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.tradeName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-driver">Entregador</Label>
            <select
              id="history-driver"
              className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
            >
              <option value="">Todos</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={apply}>Aplicar</Button>
          <Button variant="outline" onClick={clear}>
            Limpar
          </Button>
          {periodError && <p className="text-sm text-destructive">{periodError}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {deliveriesQuery.isLoading
            ? 'Carregando...'
            : `${deliveries.length} entrega${deliveries.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="outline" onClick={exportCsv} disabled={deliveries.length === 0}>
          <Download className="mr-1.5 size-4" aria-hidden="true" />
          Baixar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {deliveries.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {deliveriesQuery.isLoading
                ? 'Carregando entregas...'
                : 'Nenhuma entrega neste recorte.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Distância</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Entregador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Link
                          className="font-mono text-sm font-medium text-primary hover:underline"
                          href={`/pedidos/${delivery.id}`}
                        >
                          #{delivery.displayNumber}
                        </Link>
                        {delivery.externalOrderNumber && (
                          <span className="block text-xs text-muted-foreground">
                            {delivery.externalOrderNumber}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {delivery.companyName}
                        <span className="block text-xs text-muted-foreground">
                          {delivery.serviceTypeName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusChip status={delivery.status} />
                        {delivery.surchargeLabel && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {delivery.surchargeLabel}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {dateTime.format(new Date(delivery.createdAt))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/*
                          Travessao e nao zero: entrega com destino por GPS so
                          ganha distancia quando o motoboy confirma a entrega.
                        */}
                        {delivery.distanceKm === null
                          ? '—'
                          : `${delivery.distanceKm.toLocaleString('pt-BR')} km`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {delivery.totalValue === null ? '—' : money(delivery.totalValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {delivery.driverValue === null ? '—' : money(delivery.driverValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
