'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { AlertCircle } from 'lucide-react';
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
import { DriverRanking } from '@/components/reports/driver-ranking';
import { PeakHoursChart } from '@/components/reports/peak-hours-chart';
import { StatCard } from '@/components/stat-card';
import { adminReportsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Plural porque sao contagens, nao o estado de um pedido. Vocabulario alinhado
 * a `status-chip.tsx`, para a mesma entrega nao mudar de nome entre telas.
 */
const statusCountLabel: Record<DeliveryStatus, string> = {
  SCHEDULED: 'Agendados',
  AWAITING_DRIVER: 'Buscando motoboy',
  ACCEPTED: 'A caminho da coleta',
  COLLECTED: 'Em rota',
  DELIVERED: 'Voltando à loja',
  FAILED: 'Não entregues',
  COMPLETED: 'Concluídos',
  CANCELLED: 'Cancelados',
  AWAITING_PAYMENT: 'Aguardando pagamento',
};

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export default function AdminReportsPage() {
  const token = session.getToken();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [appliedPeriod, setAppliedPeriod] = useState<{ from?: string; to?: string }>({});
  const reportQuery = useQuery({
    queryKey: ['admin', 'operations-report', appliedPeriod],
    queryFn: () => adminReportsApi.operations(token as string, appliedPeriod),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver relatórios.
      </p>
    );
  }

  const report = reportQuery.data;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Relatório operacional e financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos criados e entregas concluídas no período, calculados diretamente dos registros
            operacionais.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="report-from">A partir de</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to">Até</Label>
            <Input
              id="report-to"
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

      {reportQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Calculando relatório...</p>
      )}
      {reportQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível gerar este relatório.
        </div>
      )}

      {report && (
        <>
          <p className="text-sm text-muted-foreground">
            Período considerado: <strong>{report.period.from}</strong> até{' '}
            <strong>{report.period.to}</strong>. Pedidos são contados pela criação; valores
            financeiros, pela conclusão.
          </p>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <StatCard label="Pedidos criados" value={String(report.ordersCreated.count)} />
            <StatCard
              label="Entregas concluídas"
              value={String(report.deliveriesCompleted.count)}
            />
            <StatCard
              label="Valor concluído"
              value={formatCurrency(report.deliveriesCompleted.totalValue)}
            />
            <StatCard
              label="Repasse aos entregadores"
              value={formatCurrency(report.deliveriesCompleted.driverValue)}
            />
            <StatCard
              label="Receita da plataforma"
              value={formatCurrency(report.deliveriesCompleted.platformValue)}
            />
          </section>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label="Ticket médio concluído"
              value={formatCurrency(report.deliveriesCompleted.averageTicket)}
            />
            {Object.entries(report.ordersCreated.byCurrentStatus).map(([status, count]) => (
              <StatCard
                key={status}
                label={statusCountLabel[status as DeliveryStatus]}
                value={String(count)}
              />
            ))}
          </section>

          <PeakHoursChart peakHours={report.peakHours} />

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Empresas</h2>
              <p className="text-sm text-muted-foreground">
                Volume criado, conclusão financeira e cancelamentos do período.
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                {report.companies.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma empresa com atividade no período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Criados</TableHead>
                        <TableHead>Concluídos</TableHead>
                        <TableHead>Cancelados</TableHead>
                        <TableHead>Valor concluído</TableHead>
                        <TableHead>Receita plataforma</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.companies.map((company) => (
                        <TableRow key={company.companyId}>
                          <TableCell>
                            <Link
                              className="font-medium text-primary underline-offset-4 hover:underline"
                              href={`/clientes/${company.companyId}`}
                            >
                              {company.companyName}
                            </Link>
                          </TableCell>
                          <TableCell>{company.createdCount}</TableCell>
                          <TableCell>{company.completedCount}</TableCell>
                          <TableCell>{company.cancelledCount}</TableCell>
                          <TableCell>{formatCurrency(company.completedTotalValue)}</TableCell>
                          <TableCell>{formatCurrency(company.platformValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Entregadores</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Volume, confiabilidade e agilidade lado a lado — ordene pela coluna que importa
                  agora.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <DriverRanking drivers={report.drivers} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Modalidades</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.serviceTypes.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma modalidade com atividade no período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modalidade</TableHead>
                        <TableHead>Criados</TableHead>
                        <TableHead>Concluídos</TableHead>
                        <TableHead>Valor concluído</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.serviceTypes.map((serviceType) => (
                        <TableRow key={serviceType.serviceTypeName}>
                          <TableCell className="font-medium">
                            {serviceType.serviceTypeName}
                          </TableCell>
                          <TableCell>{serviceType.createdCount}</TableCell>
                          <TableCell>{serviceType.completedCount}</TableCell>
                          <TableCell>{formatCurrency(serviceType.completedTotalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
