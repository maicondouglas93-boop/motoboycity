'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { CompanyAddressItem } from '@motoboycity/types';
import { MapPin } from 'lucide-react';
import { companyAddressApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * O endereço de onde o motoboy retira — o mesmo que a empresa já usa nos
 * pedidos do painel, e não uma configuração da loja. A chave da consulta é a
 * da tela inicial, que já o carrega: as duas dividem o que veio da API.
 */
export function useEnderecoDaEmpresa() {
  const token = session.getToken();
  return useQuery({
    queryKey: ['company', 'address'],
    queryFn: () => companyAddressApi.get(token as string),
    enabled: Boolean(token),
  });
}

export function enderecoEmTexto(endereco: CompanyAddressItem): { rua: string; cidade: string } {
  return {
    rua: `${endereco.street}, ${endereco.number}${endereco.complement ? ` — ${endereco.complement}` : ''}`,
    cidade: `${endereco.city}/${endereco.state}`,
  };
}

/** O endereço da empresa numa linha, com o que dizer se ele não carregar. */
export function EnderecoDaEmpresa({ className }: { className?: string }) {
  const consulta = useEnderecoDaEmpresa();

  if (consulta.isError) {
    return (
      <p className={`text-sm text-destructive ${className ?? ''}`}>
        Não foi possível carregar o endereço da empresa.
      </p>
    );
  }
  if (!consulta.data) {
    return (
      <p className={`text-sm text-muted-foreground ${className ?? ''}`}>Carregando o endereço...</p>
    );
  }
  const endereco = consulta.data.address;
  if (!endereco) {
    return (
      <p className={`text-sm ${className ?? ''}`}>
        A empresa ainda não tem endereço cadastrado.{' '}
        <Link href="/" className="font-medium underline underline-offset-2">
          Cadastre na tela inicial
        </Link>{' '}
        — é de lá que o motoboy retira.
      </p>
    );
  }
  const { rua, cidade } = enderecoEmTexto(endereco);
  return (
    <p className={`flex items-start gap-2 text-sm ${className ?? ''}`}>
      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        {rua}
        <span className="block text-muted-foreground">{cidade}</span>
      </span>
    </p>
  );
}
