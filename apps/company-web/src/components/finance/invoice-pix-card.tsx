'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ApiError } from '@motoboycity/api-client';
import type { InvoiceStatus } from '@motoboycity/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Copy, Loader2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { companyInvoicesApi } from '@/lib/api-client';

export function InvoicePixCard({
  token,
  invoiceId,
  invoiceStatus,
}: {
  token: string;
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const pixQuery = useQuery({
    queryKey: ['company', 'invoice', invoiceId, 'pix'],
    queryFn: () => companyInvoicesApi.pixCharge(token, invoiceId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'ACTIVE' || status === 'CREATING' || status === 'RECONCILIATION_REQUIRED'
        ? 5_000
        : false;
    },
  });
  const createMutation = useMutation({
    mutationFn: () => companyInvoicesApi.createPixCharge(token, invoiceId),
    onSuccess: (charge) => {
      queryClient.setQueryData(['company', 'invoice', invoiceId, 'pix'], charge);
      void queryClient.invalidateQueries({
        queryKey: ['company', 'invoice', invoiceId],
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ['company', 'invoices'] });
    },
  });

  const charge = pixQuery.data;
  const open = invoiceStatus === 'PENDING' || invoiceStatus === 'OVERDUE';

  useEffect(() => {
    if (charge?.status !== 'RECEIVED') return;
    void queryClient.invalidateQueries({
      queryKey: ['company', 'invoice', invoiceId],
      exact: true,
    });
    void queryClient.invalidateQueries({ queryKey: ['company', 'invoices'] });
  }, [charge?.status, invoiceId, queryClient]);

  if (!open && !charge) return null;

  async function copyPayload() {
    if (!charge?.pixPayload) return;
    try {
      await navigator.clipboard.writeText(charge.pixPayload);
      setCopyError(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopyError('Não foi possível copiar automaticamente. Selecione o código acima.');
    }
  }

  const error = createMutation.error ?? pixQuery.error;
  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error
        ? 'Não foi possível carregar o Pix. Tente novamente.'
        : null;

  if (charge?.status === 'RECEIVED') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-50/70 shadow-sm">
        <CardContent className="flex items-center gap-3 pt-6">
          <CheckCircle2 className="size-7 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="font-semibold text-emerald-900">Pix recebido e fatura conciliada</p>
            <p className="text-sm text-emerald-800/80">
              A confirmação veio diretamente do Asaas. Não é necessário enviar comprovante.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const qrExpired = charge?.expiresAt
    ? new Date(charge.expiresAt).getTime() <= pixQuery.dataUpdatedAt
    : false;
  const ready =
    charge?.status === 'ACTIVE' && charge.pixPayload && charge.pixEncodedImage && !qrExpired;
  return (
    <Card className="overflow-hidden border-portal/25 bg-gradient-to-br from-card via-card to-portal-soft/60 shadow-lg shadow-portal/5">
      <CardHeader className="border-b border-portal/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-portal" aria-hidden /> Pagar fatura com Pix
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Baixa automática e segura após a confirmação bancária do Asaas.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="size-3.5" aria-hidden /> Seguro
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {pixQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Consultando cobrança...
          </div>
        ) : ready ? (
          <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
            <div className="mx-auto rounded-2xl border bg-white p-3 shadow-sm">
              <Image
                unoptimized
                src={`data:image/png;base64,${charge.pixEncodedImage}`}
                alt="QR Code Pix desta fatura"
                width={192}
                height={192}
                className="size-48"
              />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Pix copia e cola</p>
                <p className="text-xs text-muted-foreground">
                  Abra o app do seu banco, escolha Pix e cole o código abaixo.
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-3 font-mono text-xs break-all text-muted-foreground">
                {charge.pixPayload}
              </div>
              <Button className="w-full sm:w-auto" onClick={() => void copyPayload()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Código copiado' : 'Copiar código Pix'}
              </Button>
              {copyError && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {copyError}
                </p>
              )}
              {charge.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  QR Code válido até {new Date(charge.expiresAt).toLocaleString('pt-BR')}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Gere uma cobrança no valor exato da fatura. A tela será atualizada assim que o
              pagamento for confirmado.
            </p>
            <Button
              size="lg"
              disabled={createMutation.isPending || !open}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : charge ? (
                <RefreshCw className="size-4" />
              ) : (
                <QrCode className="size-4" />
              )}
              {createMutation.isPending
                ? 'Gerando Pix...'
                : charge
                  ? qrExpired
                    ? 'Atualizar QR Code Pix'
                    : 'Tentar carregar o Pix novamente'
                  : 'Gerar QR Code Pix'}
            </Button>
          </div>
        )}
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {errorMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
