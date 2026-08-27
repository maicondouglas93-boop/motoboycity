'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { CompanyCustomer } from '@motoboycity/types';
import { MapPin, Pencil, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { CustomerForm } from '@/components/customers/customer-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { companyCustomersApi } from '@/lib/api-client';
import {
  formatCustomerAddress,
  formatCustomerCpf,
  formatCustomerPhone,
} from '@/lib/company-customer';
import { session } from '@/lib/session';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 20;

export default function CompanyCustomersPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyCustomer | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['company', 'customers', 'list', debouncedSearch, page],
    queryFn: () =>
      companyCustomersApi.list(token as string, {
        ...(debouncedSearch && { q: debouncedSearch }),
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companyCustomersApi.remove(token as string, id),
    onSuccess: () => {
      setFeedback('Cliente excluído do cadastro. Os pedidos anteriores foram preservados.');
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['company', 'customers'] });
    },
    onError: (error) => {
      setActionError(
        error instanceof ApiError ? error.message : 'Não foi possível excluir o cliente.',
      );
    },
  });

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  const result = customersQuery.data;
  const customers = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
    setFeedback(null);
  }

  function openEdit(customer: CompanyCustomer) {
    setEditing(customer);
    setEditorOpen(true);
    setFeedback(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-portal-deep">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Salve destinatários frequentes e reutilize seus dados nos próximos pedidos.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" /> Novo cliente
        </Button>
      </header>

      <Card className="premium-panel">
        <CardContent className="pt-4">
          <div className="relative max-w-xl">
            <Search
              className="absolute top-2.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Pesquisar por nome ou telefone"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {feedback && (
        <p className="text-sm text-status-entregue" role="status">
          {feedback}
        </p>
      )}
      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
      {customersQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando clientes...</p>
      )}
      {customersQuery.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar os clientes.</p>
            <Button type="button" variant="outline" onClick={() => void customersQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {customersQuery.isSuccess && customers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <UserRound className="size-9 text-portal" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                {debouncedSearch ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              </p>
              <p className="mt-1 text-sm">
                {debouncedSearch
                  ? 'Revise o nome ou telefone informado.'
                  : 'Cadastre agora ou salve um destinatário depois de criar um pedido.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {customersQuery.isSuccess && customers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <Card key={customer.id} className="interactive-card h-full">
              <CardHeader className="border-b border-border/60 bg-gradient-to-r from-portal-soft/65 to-transparent">
                <CardTitle className="flex items-start gap-2">
                  <span className="rounded-lg bg-portal p-2 text-white">
                    <UserRound className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{customer.name}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      CPF {formatCustomerCpf(customer.cpf)}
                    </span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-3 pt-4 text-sm">
                <p className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-portal" aria-hidden="true" />
                  {formatCustomerPhone(customer.phone)}
                </p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-portal" aria-hidden="true" />
                  <span>{formatCustomerAddress(customer.address)}</span>
                </p>
                {customer.address.referenceNote && (
                  <p className="text-xs text-muted-foreground">
                    Referência: {customer.address.referenceNote}
                  </p>
                )}
                <div className="mt-auto flex gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(customer)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" /> Editar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir ${customer.name} do cadastro? Os pedidos anteriores permanecerão intactos.`,
                        )
                      ) {
                        deleteMutation.mutate(customer.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {customersQuery.isSuccess && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {total} cliente(s) · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Cadastrar cliente'}</DialogTitle>
            <DialogDescription>
              CPF e telefone nao podem se repetir dentro da sua empresa.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <CustomerForm
              key={editing?.id ?? 'new'}
              token={token}
              initial={editing ?? undefined}
              onCancel={() => setEditorOpen(false)}
              onSaved={(customer) => {
                setEditorOpen(false);
                setFeedback(
                  editing ? 'Cliente atualizado com sucesso.' : `${customer.name} foi cadastrado.`,
                );
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
