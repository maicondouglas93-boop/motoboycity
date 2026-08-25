'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdministrativeAuditEvent } from '@motoboycity/types';
import { Download, History, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAuditApi } from '@/lib/api-client';
import { session } from '@/lib/session';

const entityLabels: Record<string, string> = {
  COMPANY: 'Empresa',
  COMPANY_MEMBER: 'Responsável',
  COMPANY_ADDRESS: 'Endereço',
  DRIVER: 'Entregador',
  DRIVER_DOCUMENT: 'Documento',
  DELIVERY: 'Pedido',
  INVOICE: 'Fatura',
  REGION: 'Região',
  SERVICE_TYPE: 'Modalidade',
  PRICING_TABLE: 'Tabela de preços',
  SURCHARGE: 'Taxa adicional',
  BUSINESS_HOURS: 'Horário de funcionamento',
  PLATFORM_SETTINGS: 'Parâmetros operacionais',
};

function entityHref(event: AdministrativeAuditEvent): string | null {
  if (event.entityType === 'COMPANY') return `/clientes/${event.entityId}`;
  if (event.entityType === 'DRIVER') return `/entregadores/${event.entityId}`;
  if (event.entityType === 'DELIVERY') return `/pedidos/${event.entityId}`;
  if (event.entityType === 'INVOICE') return `/faturas/${event.entityId}`;
  if (event.entityType === 'REGION') return '/configuracoes/regioes';
  if (event.entityType === 'SERVICE_TYPE') return '/configuracoes/tipos-de-servico';
  if (event.entityType === 'PRICING_TABLE') return '/configuracoes/tabela-de-precos';
  if (event.entityType === 'SURCHARGE') return '/configuracoes/taxas';
  if (event.entityType === 'BUSINESS_HOURS') return '/configuracoes/horario';
  if (event.entityType === 'PLATFORM_SETTINGS') return '/configuracoes/operacao';
  return null;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function AdministrativeHistoryPage() {
  const token = session.getToken();
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', { search, entityType, from, to }],
    queryFn: () =>
      adminAuditApi.list(token as string, {
        search: search || undefined,
        entityType: (entityType || undefined) as
          | 'COMPANY'
          | 'COMPANY_MEMBER'
          | 'COMPANY_ADDRESS'
          | 'DRIVER'
          | 'DRIVER_DOCUMENT'
          | 'DELIVERY'
          | 'INVOICE'
          | 'REGION'
          | 'SERVICE_TYPE'
          | 'PRICING_TABLE'
          | 'SURCHARGE'
          | 'BUSINESS_HOURS'
          | 'PLATFORM_SETTINGS'
          | undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 100,
      }),
    enabled: Boolean(token),
  });
  const events = auditQuery.data ?? [];
  const actorCount = new Set(events.map((event) => event.actor.id)).size;

  function downloadCsv() {
    const header = ['Data', 'Autor', 'Tipo', 'Ação', 'Resumo', 'ID'];
    const rows = events.map((event) => [
      new Date(event.createdAt).toLocaleString('pt-BR'),
      event.actor.name,
      entityLabels[event.entityType] ?? event.entityType,
      event.action,
      event.summary,
      event.entityId,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `historico-administrativo-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para consultar.</p>;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold text-admin-deep">
            <History className="size-6 text-primary" /> Histórico administrativo
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Alterações em cadastros, documentos, operação, preços, pedidos e faturas, com autor e
            data.
          </p>
        </div>
        <Button variant="outline" onClick={downloadCsv} disabled={events.length === 0}>
          <Download className="size-4" /> Exportar CSV
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">Eventos exibidos</p>
            <p className="mt-1 text-2xl font-semibold">{events.length}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs text-muted-foreground">Administradores</p>
            <p className="mt-1 text-2xl font-semibold">{actorCount}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Trilha protegida
            </p>
            <p className="mt-1 text-sm font-semibold">Somente leitura</p>
          </CardContent>
        </Card>
      </section>

      <Card size="sm">
        <CardContent className="grid gap-3 pt-4 md:grid-cols-[minmax(220px,1fr)_200px_160px_160px]">
          <div className="space-y-1.5">
            <Label htmlFor="audit-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                id="audit-search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Resumo, autor, ação ou ID"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-type">Tipo</Label>
            <select
              id="audit-type"
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(entityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">A partir de</Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">Até</Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {auditQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico...</p>
      ) : auditQuery.isError ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar o histórico.
        </p>
      ) : events.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma alteração encontrada para estes filtros.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {events.map((event) => {
            const href = entityHref(event);
            return (
              <Card key={event.id} size="sm" className="border-l-4 border-l-primary/55">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                        {entityLabels[event.entityType] ?? event.entityType}
                      </p>
                      <p className="mt-1 text-sm font-medium text-admin-deep">{event.summary}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString('pt-BR')}
                    </time>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span>
                      Por <strong className="text-foreground">{event.actor.name}</strong> ·{' '}
                      {event.action}
                    </span>
                    {href ? (
                      <Link className="font-semibold text-primary hover:underline" href={href}>
                        Abrir registro
                      </Link>
                    ) : (
                      <span>ID: {event.entityId}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
