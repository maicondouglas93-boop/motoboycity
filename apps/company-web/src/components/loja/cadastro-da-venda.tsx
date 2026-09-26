'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyCustomer } from '@motoboycity/types';
import { Check, UserPlus } from 'lucide-react';
import { CustomerAddressForm } from '@/components/customers/customer-address-form';
import { CustomerForm } from '@/components/customers/customer-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { companyAddressApi, companyCustomersApi } from '@/lib/api-client';
import {
  buildStoreOrderCustomerPrefill,
  customerHasAddress,
  type StoreOrderCustomerSource,
  unusedAddressLabel,
} from '@/lib/company-customer';
import { session } from '@/lib/session';

/**
 * O cliente da loja online vira cliente da loja aqui, com os dados que ele
 * mesmo digitou no checkout — em vez de alguém redigitar tudo no cadastro. Só
 * vira cadastro se a loja salvar (decisão 19 do plano da loja online).
 *
 * Conferido pelo telefone, e são três situações, não um botão só: quem já é
 * cliente mas pediu de um endereço novo precisa que o ENDEREÇO seja salvo, e
 * não que um cliente duplicado seja criado.
 */
export function CadastroDaVenda({ venda }: { venda: StoreOrderCustomerSource }) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = useState<'cliente' | 'endereco' | null>(null);

  // A mesma consulta do "Chamar entregador": sem CEP ou UF no checkout, valem os da loja.
  const coletaQuery = useQuery({
    queryKey: ['company', 'address'],
    queryFn: () => companyAddressApi.get(token as string),
    enabled: Boolean(token),
  });
  const prefill = buildStoreOrderCustomerPrefill(venda, coletaQuery.data?.address ?? null);
  // A chave do cadastro depois da entrega concluída: as duas telas dividem a resposta.
  const matchQueryKey = ['company', 'customers', 'match', prefill?.phone ?? null] as const;
  const matchQuery = useQuery({
    queryKey: matchQueryKey,
    queryFn: () => companyCustomersApi.match(token as string, { phone: prefill!.phone }),
    enabled: Boolean(token && prefill),
    staleTime: 60_000,
    retry: false,
  });

  if (!token || !prefill) return null;

  const cliente = matchQuery.data?.customer ?? null;
  const enderecoSalvo = cliente ? customerHasAddress(cliente, prefill.address) : false;
  const aoSalvarCliente = (salvo: CompanyCustomer) => {
    queryClient.setQueryData(matchQueryKey, { customer: salvo });
    setSalvando(null);
  };

  return (
    <>
      {matchQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Conferindo o seu cadastro de clientes...</p>
      ) : matchQuery.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">
            Não foi possível conferir se este cliente já está cadastrado.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => matchQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !cliente ? (
        <>
          <p className="text-xs text-muted-foreground">
            Este telefone não está no seu cadastro de clientes.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={coletaQuery.isLoading}
            onClick={() => setSalvando('cliente')}
          >
            <UserPlus className="size-4" /> Salvar cliente
          </Button>
        </>
      ) : enderecoSalvo ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-700">
          <Check className="size-3.5" aria-hidden="true" />
          Já é seu cliente, e este endereço já está salvo nele.
          <Link href={`/clientes/${cliente.id}`} className="font-semibold hover:underline">
            Abrir o cadastro de {cliente.name}
          </Link>
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Já é seu cliente ({cliente.name}), mas pediu de um endereço que não está salvo.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={coletaQuery.isLoading}
            onClick={() => setSalvando('endereco')}
          >
            <UserPlus className="size-4" /> Salvar este endereço no cliente
          </Button>
        </>
      )}

      <Dialog open={salvando !== null} onOpenChange={(aberto) => !aberto && setSalvando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {salvando === 'endereco' ? 'Salvar o endereço deste pedido' : 'Salvar cliente'}
            </DialogTitle>
            <DialogDescription>
              Com os dados que o cliente digitou no pedido. Confira antes de salvar: a rua e o
              número vieram escritos por ele.
              {/* O formulário não tem campo de CEP: ele vem do endereço escolhido no Google. */}
              {!prefill.address.zip &&
                ' O pedido veio sem CEP: busque o endereço no campo "Endereço completo" e escolha na lista para completar.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {salvando === 'cliente' && (
              <CustomerForm
                token={token}
                initial={prefill}
                onCancel={() => setSalvando(null)}
                onSaved={aoSalvarCliente}
              />
            )}
            {salvando === 'endereco' && cliente && (
              <CustomerAddressForm
                token={token}
                customerId={cliente.id}
                prefill={{
                  label: unusedAddressLabel(cliente, prefill.addressLabel ?? 'Endereço'),
                  address: prefill.address,
                }}
                onCancel={() => setSalvando(null)}
                onSaved={(endereco) =>
                  aoSalvarCliente({ ...cliente, addresses: [...cliente.addresses, endereco] })
                }
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
