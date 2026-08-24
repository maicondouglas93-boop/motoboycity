'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentNoticeQueueItem } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { CheckCircle2, HandCoins, TriangleAlert, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { paymentNoticeApi } from '@/lib/api-client';
import { formatarData, formatarDataHora } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

const SITUACOES = [
  { valor: 'PENDING', rotulo: 'Aguardando conferência' },
  { valor: 'CONFIRMED', rotulo: 'Confirmados' },
  { valor: 'REJECTED', rotulo: 'Recusados' },
] as const;

type Situacao = (typeof SITUACOES)[number]['valor'];

/** Hoje em `AAAA-MM-DD`, no fuso da operação. */
function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * A fila de avisos de pagamento.
 *
 * A loja diz que pagou; aqui o admin confere contra o extrato e decide. Nada
 * nesta tela confia no valor informado pela loja: a diferença contra o total da
 * fatura fica em destaque justamente para não passar batido.
 */
export function AvisosTab({ token }: { token: string }) {
  const [situacao, setSituacao] = useState<Situacao>('PENDING');

  const avisosQuery = useQuery({
    queryKey: ['admin', 'payment-notices', situacao],
    queryFn: () => paymentNoticeApi.queue(token, situacao),
  });

  const avisos = avisosQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {SITUACOES.map((opcao) => (
          <Button
            key={opcao.valor}
            variant={situacao === opcao.valor ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSituacao(opcao.valor)}
          >
            {opcao.rotulo}
          </Button>
        ))}
      </div>

      {avisosQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando avisos...</p>
      )}
      {avisosQuery.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar a fila.</p>
      )}

      {!avisosQuery.isLoading && avisos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <HandCoins className="size-8" />
            {situacao === 'PENDING' ? 'Nenhum aviso aguardando conferência.' : 'Nada por aqui.'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {avisos.map((aviso) => (
          <CartaoDoAviso key={aviso.id} token={token} aviso={aviso} />
        ))}
      </div>
    </div>
  );
}

function CartaoDoAviso({ token, aviso }: { token: string; aviso: PaymentNoticeQueueItem }) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const [dataDoPagamento, setDataDoPagamento] = useState(aviso.paidAt || hoje());
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const pendente = aviso.status === 'PENDING';
  /** Diferença relevante: centavos de arredondamento não merecem alarme. */
  const divergente = Math.abs(aviso.difference) >= 0.01;

  function aoFalhar(error: unknown) {
    setErro(error instanceof ApiError ? error.message : 'Não foi possível concluir.');
  }

  function aoConcluir() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payment-notices'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
    setErro(null);
  }

  const confirmar = useMutation({
    mutationFn: () =>
      paymentNoticeApi.confirm(token, aviso.id, {
        paymentDate: dataDoPagamento,
        paymentMethod: 'BILLED',
      }),
    onSuccess: aoConcluir,
    onError: aoFalhar,
  });

  const recusar = useMutation({
    mutationFn: () => paymentNoticeApi.reject(token, aviso.id, { reviewNote: motivo.trim() }),
    onSuccess: aoConcluir,
    onError: aoFalhar,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{aviso.companyName}</p>
            <p className="text-sm text-muted-foreground">
              <Link href={`/faturas/${aviso.invoiceId}`} className="hover:underline">
                {aviso.invoiceNumber}
              </Link>{' '}
              · total {money(aviso.invoiceTotalValue)} · pago em {formatarData(aviso.paidAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold">{money(aviso.amount)}</p>
            <p className="text-xs text-muted-foreground">valor informado pela loja</p>
          </div>
        </div>

        {divergente && (
          /*
            O numero que decide a conferencia. Sem destaque, um aviso de
            R$ 34,00 numa fatura de R$ 340,00 seria confirmado no automatico.
          */
          <div className="flex items-start gap-2 rounded-lg bg-dinheiro-atrasado-suave p-3 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-dinheiro-atrasado" />
            <p className="text-dinheiro-atrasado">
              {aviso.difference < 0 ? (
                <>
                  Faltam <strong>{money(Math.abs(aviso.difference))}</strong> para o total da
                  fatura.
                </>
              ) : (
                <>
                  Pagou <strong>{money(aviso.difference)}</strong> a mais que o total da fatura.
                </>
              )}
            </p>
          </div>
        )}

        {aviso.note && (
          <p className="rounded-lg bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Observação da loja: </span>
            {aviso.note}
          </p>
        )}

        {pendente ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`data-${aviso.id}`}>Data que vai para a fatura</Label>
                <Input
                  id={`data-${aviso.id}`}
                  type="date"
                  value={dataDoPagamento}
                  onChange={(event) => setDataDoPagamento(event.target.value)}
                />
              </div>
              <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
                <CheckCircle2 aria-hidden className="size-4" />
                {confirmar.isPending ? 'Confirmando...' : 'Confirmar recebimento'}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <div className="min-w-64 flex-1 space-y-1">
                <Label htmlFor={`motivo-${aviso.id}`}>Motivo da recusa</Label>
                <Input
                  id={`motivo-${aviso.id}`}
                  placeholder="Ex.: não localizei o PIX no extrato"
                  maxLength={280}
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                />
              </div>
              {/*
                O motivo e exigido antes do clique: recusar em silencio deixa a
                loja sem saber o que corrigir, e ela avisa de novo igual.
              */}
              <Button
                variant="outline"
                onClick={() => recusar.mutate()}
                disabled={recusar.isPending || motivo.trim().length < 3}
              >
                <XCircle aria-hidden className="size-4" />
                {recusar.isPending ? 'Recusando...' : 'Recusar'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
            <Badge variant={aviso.status === 'CONFIRMED' ? 'secondary' : 'destructive'}>
              {aviso.status === 'CONFIRMED' ? 'Confirmado' : 'Recusado'}
            </Badge>
            <span className="text-muted-foreground">
              por {aviso.reviewedBy?.name ?? 'administrador'} em{' '}
              {formatarDataHora(aviso.reviewedAt)}
            </span>
            {aviso.reviewNote && <span>· {aviso.reviewNote}</span>}
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}
