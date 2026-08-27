'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CompanyCustomer } from '@motoboycity/types';
import { Search, UserRound, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { companyCustomersApi } from '@/lib/api-client';
import { formatCustomerAddress, formatCustomerPhone } from '@/lib/company-customer';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface Props {
  token: string;
  selectedName?: string;
  onSelect: (customer: CompanyCustomer) => void;
  onClear: () => void;
}

export function CustomerAutocomplete({ token, selectedName, onSelect, onClear }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const customersQuery = useQuery({
    queryKey: ['company', 'customers', 'autocomplete', debouncedSearch],
    queryFn: () => companyCustomersApi.list(token, { q: debouncedSearch, pageSize: 8 }),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  if (selectedName) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-portal/20 bg-portal-soft/55 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-medium text-portal-deep">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Cliente: {selectedName}</span>
        </span>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Remover cliente selecionado"
          onClick={() => {
            setSearch('');
            onClear();
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative space-y-1">
      <div className="relative">
        <Search
          className="absolute top-2.5 left-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar cliente por nome ou telefone"
          aria-label="Pesquisar cliente cadastrado"
          autoComplete="off"
        />
      </div>

      {debouncedSearch.length >= 2 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {customersQuery.isLoading && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Buscando clientes...</p>
          )}
          {customersQuery.isError && (
            <p className="px-2 py-2 text-xs text-destructive">Não foi possível buscar clientes.</p>
          )}
          {customersQuery.data?.items.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="block w-full rounded-lg px-2.5 py-2 text-left text-xs hover:bg-portal-soft"
              onClick={() => {
                onSelect(customer);
                setSearch('');
              }}
            >
              <span className="block font-semibold text-foreground">{customer.name}</span>
              <span className="block text-muted-foreground">
                {formatCustomerPhone(customer.phone)} · {formatCustomerAddress(customer.address)}
              </span>
            </button>
          ))}
          {customersQuery.isSuccess && customersQuery.data.items.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
