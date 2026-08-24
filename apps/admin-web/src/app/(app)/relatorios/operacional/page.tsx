'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarRange,
  CircleDollarSign,
  History,
  Layers3,
  ListChecks,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useMoney } from '@/lib/money';

/**
 * Plural porque são contagens, não o estado de um pedido. Vocabulário alinhado
 * a `status-chip.tsx`, para a mesma entrega não mudar de nome entre telas.
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

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-admin-deep">{title}</h2>
          <p className="mt-0.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

const reportSections = [
  ['#visao-geral', 'Visão geral'],
  ['#financeiro', 'Financeiro'],
  ['#status-pedidos', 'Pedidos'],
  ['#horarios-pico', 'Horários de pico'],
  ['#empresas', 'Clientes'],
  ['#entregadores', 'Entregadores'],
] as const;

export default function OperationalReportPage() {
  const money = useMoney();
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

  useEffect(() => {
    if (!reportQuery.data || !window.location.hash) return;

    const sectionId = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [reportQuery.data]);

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
    <div className="mx-auto w-full max-w-[1480px] space-y-7 pb-12">
      <header className="space-y-3">
        <Link
          href="/relatorios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Central de relatórios
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-admin-deep">
            Relatório operacional e financeiro
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Acompanhe volume, receita, horários de pico, clientes e entregadores a partir dos
            registros reais da operação.
          </p>
        </div>
      </header>

      <Card className="premium-panel">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarRange className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Período do relatório</CardTitle>
              <CardDescription className="mt-1">
                Deixe as datas em branco para usar o período padrão da operação.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5 sm:max-w-60">
              <Label htmlFor="report-from">A partir de</Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="min-w-48 flex-1 space-y-1.5 sm:max-w-60">
              <Label htmlFor="report-to">Até</Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <Button type="button" onClick={applyPeriod} disabled={reportQuery.isFetching}>
              {reportQuery.isFetching ? 'Atualizando...' : 'Aplicar período'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearPeriod}
              disabled={reportQuery.isFetching}
            >
              Limpar
            </Button>
          </div>
          {periodError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {periodError}
            </div>
          )}
        </CardContent>
      </Card>

      <nav
        aria-label="Seções do relatório"
        className="flex flex-wrap gap-2 rounded-2xl border border-primary/10 bg-card/75 p-2 shadow-sm"
      >
        {reportSections.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-admin-soft hover:text-admin-deep"
          >
            {label}
          </Link>
        ))}
      </nav>

      {reportQuery.isLoading && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Calculando relatório...
          </CardContent>
        </Card>
      )}
      {reportQuery.isError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          Não foi possível gerar este relatório.
        </div>
      )}

      {report && (
        <div className="space-y-10">
          {!report.live && (
            <div className="flex items-start gap-3 rounded-xl border border-alerta/40 bg-alerta/5 p-4 text-sm">
              <History className="mt-0.5 size-5 shrink-0 text-alerta" aria-hidden="true" />
              <p>
                <strong className="text-alerta">Recorte histórico.</strong> Este período terminou em{' '}
                {report.period.to} e não recebe atualizações em tempo real.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-primary/10 bg-admin-soft/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
            Período considerado: <strong className="text-admin-deep">{report.period.from}</strong>{' '}
            até <strong className="text-admin-deep">{report.period.to}</strong>. Comparação com{' '}
            <strong className="text-admin-deep">{report.comparison.period.from}</strong> até{' '}
            <strong className="text-admin-deep">{report.comparison.period.to}</strong>, em uma
            janela de mesma duração.
          </div>

          <section id="visao-geral" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={BarChart3}
              title="Visão geral"
              description="Os principais números do período e a variação em relação à janela anterior."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Pedidos criados"
                value={String(report.ordersCreated.count)}
                changePercent={report.comparison.changePercent.ordersCreated}
              />
              <StatCard
                label="Entregas concluídas"
                value={String(report.deliveriesCompleted.count)}
                changePercent={report.comparison.changePercent.deliveriesCompleted}
              />
              <StatCard
                label="Ticket médio concluído"
                value={money(report.deliveriesCompleted.averageTicket)}
                changePercent={report.comparison.changePercent.averageTicket}
              />
            </div>
          </section>

          <section id="financeiro" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={CircleDollarSign}
              title="Composição financeira"
              description="Separe o volume concluído entre repasse aos entregadores e receita da plataforma."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Valor concluído"
                value={money(report.deliveriesCompleted.totalValue)}
                changePercent={report.comparison.changePercent.totalValue}
              />
              <StatCard
                label="Repasse aos entregadores"
                value={money(report.deliveriesCompleted.driverValue)}
              />
              <StatCard
                label="Receita da plataforma"
                value={money(report.deliveriesCompleted.platformValue)}
              />
            </div>
          </section>

          <section id="status-pedidos" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={ListChecks}
              title="Situação dos pedidos"
              description="Distribuição dos pedidos criados no período pelo estado operacional atual."
              action={
                <Link
                  href="/relatorios/historico"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-card px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-admin-soft"
                >
                  Abrir histórico
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {Object.entries(report.ordersCreated.byCurrentStatus).map(([status, count]) => (
                <StatCard
                  key={status}
                  label={statusCountLabel[status as DeliveryStatus]}
                  value={String(count)}
                />
              ))}
            </div>
          </section>

          <Link
            href="/relatorios/historico"
            className="group flex items-center gap-4 rounded-2xl border border-primary/15 bg-gradient-to-r from-admin-soft/70 to-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <History className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading font-semibold text-admin-deep">
                Histórico detalhado de entregas
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Consulte entrega por entrega, aplique filtros e exporte os resultados para planilha.
              </span>
            </span>
            <ArrowRight
              className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>

          <div id="horarios-pico" className="scroll-mt-24">
            <PeakHoursChart peakHours={report.peakHours} />
          </div>

          <section id="empresas" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={Building2}
              title="Desempenho por cliente"
              description="Compare volume criado, conclusões, cancelamentos e receita por empresa."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
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
                          <TableCell>{money(company.completedTotalValue)}</TableCell>
                          <TableCell>{money(company.platformValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section id="entregadores" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={Truck}
              title="Entregadores"
              description="Volume, confiabilidade e agilidade lado a lado, com ordenação por coluna."
            />
            <Card>
              <CardContent className="p-0">
                <DriverRanking drivers={report.drivers} />
              </CardContent>
            </Card>
          </section>

          <section id="modalidades" className="scroll-mt-24 space-y-4">
            <SectionHeading
              icon={Layers3}
              title="Modalidades de serviço"
              description="Volume e valor concluído por tipo de serviço utilizado no período."
            />
            <Card>
              <CardContent className="overflow-x-auto p-0">
                {report.serviceTypes.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
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
                          <TableCell>{money(serviceType.completedTotalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
