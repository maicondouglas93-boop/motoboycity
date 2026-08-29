'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { ApiError } from '@motoboycity/api-client';
import type { CompanyCustomerSavedAddress } from '@motoboycity/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronLeft,
  Clock3,
  MapPin,
  PackageSearch,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { CustomerAddressForm } from '@/components/customers/customer-address-form';
import { StatCard } from '@/components/stat-card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { companyCustomersApi } from '@/lib/api-client';
import {
  formatCustomerAddress,
  formatCustomerCpf,
  formatCustomerPhone,
} from '@/lib/company-customer';
import { session } from '@/lib/session';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Nenhuma entrega';
}

export default function CompanyCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CompanyCustomerSavedAddress | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ['company', 'customers', 'detail', id],
    queryFn: () => companyCustomersApi.detail(token as string, id),
    enabled: Boolean(token),
  });

  const deleteMutation = useMutation({
    mutationFn: (addressId: string) =>
      companyCustomersApi.removeAddress(token as string, id, addressId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'customers'] });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível excluir o endereço.',
      );
    },
  });

  if (!token) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }
  if (customerQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando cliente...</p>;
  }
  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-portal"
          href="/clientes"
        >
          <ChevronLeft className="size-4" /> Voltar para clientes
        </Link>
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" /> Não foi possível carregar este cliente.
        </p>
      </div>
    );
  }

  const customer = customerQuery.data;
  const statistics = customer.statistics;

  function openAddressEditor(address?: CompanyCustomerSavedAddress) {
    setEditingAddress(address ?? null);
    setActionError(null);
    setEditorOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-portal transition-colors hover:text-portal-deep"
        href="/clientes"
      >
        <ChevronLeft className="size-4" /> Voltar para clientes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-portal-deep">
            {customer.name}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5 text-portal" /> {formatCustomerPhone(customer.phone)}
            </span>
            <span>CPF: {formatCustomerCpf(customer.cpf)}</span>
          </p>
        </div>
        {/*
          O cadastro deixa de ser so uma agenda.
          Ate aqui esta tela mostrava "12 entregas concluidas" sem deixar ver
          quais, e criar um pedido para o cliente aberto na tela exigia sair,
          ir em Pedidos e digitar o nome de novo no autocomplete. Os dois
          caminhos reusam telas que ja existem — a busca por destinatario e a
          semente do formulario — em vez de duplicar operacao.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={buttonVariants({ variant: 'outline' })}
            href={`/pedidos?q=${encodeURIComponent(customer.phone)}`}
          >
            <PackageSearch className="size-4" /> Ver entregas
          </Link>
          <Link className={buttonVariants()} href={`/?cliente=${customer.id}`}>
            <Plus className="size-4" /> Novo pedido
          </Link>
          <Button type="button" variant="outline" onClick={() => openAddressEditor()}>
            <Plus className="size-4" /> Novo endereço
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total de entregas" value={statistics.totalDeliveries} />
        <StatCard label="Em andamento" value={statistics.inProgressDeliveries} />
        <StatCard label="Concluídas" value={statistics.completedDeliveries} />
        <StatCard label="Canceladas" value={statistics.cancelledDeliveries} />
        <StatCard label="Última entrega" value={formatDate(statistics.lastDeliveryAt)} />
      </section>

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="premium-panel">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-portal" /> Endereços salvos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <article
                key={address.id}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-portal/12 bg-portal-soft/25 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-portal-deep">{address.label}</p>
                    {address.isPrimary && (
                      <span className="mt-1 inline-flex rounded-full bg-portal/10 px-2 py-0.5 text-[11px] font-medium text-portal">
                        Principal
                      </span>
                    )}
                  </div>
                  <MapPin className="size-4 shrink-0 text-portal" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">{formatCustomerAddress(address)}</p>
                {address.referenceNote && (
                  <p className="text-xs text-muted-foreground">
                    Referência: {address.referenceNote}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAddressEditor(address)}
                  >
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  {!address.isPrimary && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Excluir o endereço ${address.label}?`)) {
                          deleteMutation.mutate(address.id);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Excluir
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card className="premium-panel">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="size-4 text-portal" /> Endereços mais utilizados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {statistics.mostUsedAddresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                As estatísticas aparecerão depois da primeira entrega.
              </p>
            ) : (
              statistics.mostUsedAddresses.map((item, index) => (
                <div
                  key={`${item.address}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-portal-deep">
                      {item.savedAddressLabel ?? item.address}
                    </p>
                    {item.savedAddressLabel && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.address}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-portal-soft px-2 py-1 text-xs font-semibold text-portal">
                    {item.deliveries} entrega{item.deliveries === 1 ? '' : 's'}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAddress ? 'Editar endereço' : 'Novo endereço'}</DialogTitle>
            <DialogDescription>
              Dê um nome como Casa, Trabalho ou Loja para encontrá-lo rapidamente no pedido.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CustomerAddressForm
              key={editingAddress?.id ?? 'new'}
              token={token}
              customerId={id}
              initial={editingAddress ?? undefined}
              onCancel={() => setEditorOpen(false)}
              onSaved={() => setEditorOpen(false)}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
