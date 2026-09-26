'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AmbienteDoAsaas, ContaAsaasDaLoja } from '@motoboycity/types';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyStoreAsaasApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { CHAVE_DA_OPERACAO } from '@/components/loja/operacao';

export const CHAVE_DA_CONTA_ASAAS = ['company', 'store', 'asaas-account'] as const;

/** A conta Asaas da loja: o cartão dela e o de formas de pagamento leem a mesma. */
export function useContaAsaas() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DA_CONTA_ASAAS,
    queryFn: () => companyStoreAsaasApi.conta(token as string),
    enabled: Boolean(token),
  });
}

/** O Pix pela página: conta ligada e com chave Pix ativa. */
export function recebePix(conta: ContaAsaasDaLoja | undefined): boolean {
  return conta?.conectada === true && conta.temChavePix;
}

const AMBIENTES: Array<{ valor: AmbienteDoAsaas; titulo: string; detalhe: string }> = [
  {
    valor: 'PRODUCAO',
    titulo: 'Produção',
    detalhe: 'A conta de verdade: o cliente paga e o dinheiro cai na sua conta.',
  },
  {
    valor: 'SANDBOX',
    titulo: 'Testes (sandbox)',
    detalhe: 'A conta de testes do Asaas: o Pix é de mentira, para experimentar antes.',
  },
];

/**
 * O recebimento online: a loja cola a chave da API da conta Asaas DELA, e o
 * cliente paga pela página direto nessa conta. A central continua cobrando as
 * entregas na fatura; o dinheiro da venda nunca passa por ela (decisão 3).
 *
 * A chave vai para o servidor, que a confere no Asaas e a guarda cifrada; ela
 * nunca volta para a tela — ao trocar de conta, cola-se outra.
 */
export function ContaAsaas() {
  const consulta = useContaAsaas();
  const conta = consulta.data;
  const [trocando, setTrocando] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recebimento online pelo Asaas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Com a sua conta Asaas ligada aqui, o cliente paga pelo Pix na página{' '}
          <strong>direto na sua conta</strong>. A central continua cobrando as entregas na fatura,
          como hoje: o dinheiro da venda nunca passa por ela. Pedido pago e cancelado volta inteiro
          para o cliente, sozinho — as tarifas do Asaas não voltam.
        </p>

        {consulta.isError && (
          <div className="space-y-2">
            <p className="text-destructive">Não foi possível carregar a conta.</p>
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!conta && !consulta.isError && <p className="text-muted-foreground">Carregando...</p>}

        {conta?.conectada && !trocando && (
          <ContaLigada conta={conta} onTrocar={() => setTrocando(true)} />
        )}
        {conta && (!conta.conectada || trocando) && (
          <Ligar
            trocando={trocando}
            onPronto={() => setTrocando(false)}
            onVoltar={() => setTrocando(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ContaLigada({
  conta,
  onTrocar,
}: {
  conta: Extract<ContaAsaasDaLoja, { conectada: true }>;
  onTrocar: () => void;
}) {
  const queryClient = useQueryClient();
  const token = session.getToken();
  const [desligando, setDesligando] = useState(false);
  const desligar = useMutation({
    mutationFn: () => companyStoreAsaasApi.desconectar(token as string),
    onSuccess: (resposta) => {
      queryClient.setQueryData(CHAVE_DA_CONTA_ASAAS, resposta);
      // Desligar tira o Pix das formas de pagamento no servidor.
      void queryClient.invalidateQueries({ queryKey: CHAVE_DA_OPERACAO });
      setDesligando(false);
    },
  });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <p className="font-medium">{conta.nome}</p>
        {conta.email && <p className="text-xs text-muted-foreground">{conta.email}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {conta.ambiente === 'SANDBOX' ? 'Conta de testes (sandbox)' : 'Conta de produção'}
        </p>
      </div>
      {conta.ambiente === 'SANDBOX' && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          É a conta de testes: o Pix dos pedidos é de mentira. Para receber de verdade, troque pela
          conta de produção.
        </p>
      )}
      {!conta.temChavePix && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
        >
          A conta não tem chave Pix ativa, e sem ela o Asaas não gera o QR code. Cadastre uma chave
          Pix no Asaas e ligue a conta de novo, em &quot;Trocar a conta&quot;.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onTrocar}>
          Trocar a conta
        </Button>
        {!desligando ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDesligando(true)}>
            Desligar
          </Button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            O Pix sai da página na hora.
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={desligar.isPending}
              onClick={() => desligar.mutate()}
            >
              Desligar a conta
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDesligando(false)}>
              Voltar
            </Button>
          </span>
        )}
      </div>
      {desligar.isError && (
        <p role="alert" className="text-xs text-destructive">
          {mensagemDoErro(desligar.error, 'Não foi possível desligar a conta.')}
        </p>
      )}
    </div>
  );
}

function Ligar({
  trocando,
  onPronto,
  onVoltar,
}: {
  trocando: boolean;
  onPronto: () => void;
  onVoltar: () => void;
}) {
  const queryClient = useQueryClient();
  const token = session.getToken();
  const [chave, setChave] = useState('');
  const [ambiente, setAmbiente] = useState<AmbienteDoAsaas>('PRODUCAO');
  const ligar = useMutation({
    mutationFn: () =>
      companyStoreAsaasApi.conectar(token as string, { chaveDaApi: chave.trim(), ambiente }),
    onSuccess: (resposta) => {
      queryClient.setQueryData(CHAVE_DA_CONTA_ASAAS, resposta);
      setChave('');
      onPronto();
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (chave.trim()) ligar.mutate();
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          No Asaas, abra <strong>Integrações → Chaves de API</strong> e gere uma chave. Ela aparece
          uma vez só: copie na hora.
        </li>
        <li>A conta precisa de uma chave Pix ativa — é para ela que o Pix dos pedidos vai.</li>
        <li>Cole a chave abaixo. O MOTOboyCity confere com o Asaas e guarda cifrada.</li>
      </ol>
      <div className="space-y-2">
        <Label htmlFor="chaveDoAsaas">Chave da API do Asaas</Label>
        <Input
          id="chaveDoAsaas"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={chave}
          onChange={(evento) => setChave(evento.target.value)}
          placeholder="$aact_..."
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium">Qual conta é</legend>
        {AMBIENTES.map((opcao) => (
          <label
            key={opcao.valor}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
              ambiente === opcao.valor ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <input
              type="radio"
              name="ambienteDoAsaas"
              className="mt-1"
              checked={ambiente === opcao.valor}
              onChange={() => setAmbiente(opcao.valor)}
            />
            <span>
              {opcao.titulo}
              <span className="block text-xs text-muted-foreground">{opcao.detalhe}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!chave.trim() || ligar.isPending}>
          {ligar.isPending ? 'Conferindo com o Asaas...' : 'Ligar a conta'}
        </Button>
        {trocando && (
          <Button type="button" variant="ghost" size="sm" onClick={onVoltar}>
            Voltar
          </Button>
        )}
      </div>
      {ligar.isError && (
        <p role="alert" className="text-xs text-destructive">
          {mensagemDoErro(ligar.error, 'Não foi possível ligar a conta.')}
        </p>
      )}
    </form>
  );
}
