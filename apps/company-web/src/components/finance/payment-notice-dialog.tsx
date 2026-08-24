'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { paymentNoticeApi } from '@/lib/api-client';
import { formatarDinheiro } from '@/lib/dinheiro';

/** Hoje em `AAAA-MM-DD`, no fuso da operação. */
function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * "Já paguei": a loja avisa, o admin confere.
 *
 * O aviso é dito na cara, antes dos campos: isto NÃO quita a fatura. Sem essa
 * frase a loja clica, vê a confirmação e assume que acabou — e descobre a
 * dívida ainda aberta na semana seguinte.
 */
export function PaymentNoticeDialog({
  token,
  invoiceId,
  invoiceNumber,
  invoiceTotal,
}: {
  token: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
}) {
  const [aberto, setAberto] = useState(false);
  /**
   * Já vem com o total preenchido.
   *
   * O caso comum é pagar a fatura inteira; obrigar a redigitar um número que
   * está na tela ao lado só produz erro de digitação para o admin conferir.
   */
  const [valor, setValor] = useState(invoiceTotal.toFixed(2));
  const [pagoEm, setPagoEm] = useState(hoje);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const valorNumerico = Number(valor.replace(',', '.'));
  const valorInvalido = !Number.isFinite(valorNumerico) || valorNumerico <= 0;

  // A consulta só abre junto com o diálogo para não criar uma requisição por
  // linha da tabela. Ela impede novo envio silencioso enquanto já há decisão
  // pendente e também devolve à loja o motivo da última recusa.
  const avisosQuery = useQuery({
    queryKey: ['company', 'payment-notices', invoiceId],
    queryFn: () => paymentNoticeApi.listForInvoice(token, invoiceId),
    enabled: aberto,
  });
  const avisoPendente = avisosQuery.data?.find((aviso) => aviso.status === 'PENDING');
  const ultimoRecusado = avisosQuery.data?.find((aviso) => aviso.status === 'REJECTED');

  const enviar = useMutation({
    mutationFn: () =>
      paymentNoticeApi.create(token, invoiceId, {
        amount: valorNumerico,
        paidAt: pagoEm,
        ...(observacao.trim() && { note: observacao.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', 'payment-notices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['company', 'invoices'] });
      setAberto(false);
      setObservacao('');
      setErro(null);
    },
    onError: (error) => {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível enviar o aviso.');
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <HandCoins aria-hidden className="size-3.5" />
            Já paguei
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Avisar pagamento da {invoiceNumber}</DialogTitle>
          <DialogDescription>Total da fatura: {formatarDinheiro(invoiceTotal)}</DialogDescription>
        </DialogHeader>

        {avisosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Consultando avisos anteriores...</p>
        ) : avisosQuery.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              Não foi possível consultar o aviso desta fatura. Feche e tente novamente.
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Fechar</Button>} />
            </DialogFooter>
          </div>
        ) : avisoPendente ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm">
              <p className="font-medium text-dinheiro-aguardando">Aviso aguardando conferência</p>
              <p className="mt-1 text-muted-foreground">
                A MOTOboyCity está conferindo o pagamento informado de{' '}
                {formatarDinheiro(avisoPendente.amount)}. Não é necessário enviar novamente.
              </p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Fechar</Button>} />
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {ultimoRecusado && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">O último aviso foi recusado</p>
                  <p className="mt-1 text-muted-foreground">
                    {ultimoRecusado.reviewNote ?? 'Confira os dados antes de enviar novamente.'}
                  </p>
                </div>
              )}

              {/*
                A consequencia vem antes dos campos, no mesmo lugar em que o dialogo
                de cancelar fatura do admin coloca a dele.
              */}
              <div className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm">
                <p className="font-medium text-dinheiro-aguardando">Isto não quita a fatura</p>
                <p className="mt-1 text-muted-foreground">
                  O aviso vai para a conferência da MOTOboyCity. A fatura só passa a constar como
                  paga depois que eles confirmarem o recebimento.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aviso-valor">Valor pago</Label>
                <Input
                  id="aviso-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                />
                {!valorInvalido && valorNumerico !== invoiceTotal && (
                  // Divergir e permitido — pagamento parcial acontece — mas a loja
                  // ve que esta divergindo agora, em vez de descobrir depois.
                  <p className="text-xs text-dinheiro-aguardando">
                    Diferente do total da fatura, que é {formatarDinheiro(invoiceTotal)}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aviso-data">Data do pagamento</Label>
                <Input
                  id="aviso-data"
                  type="date"
                  value={pagoEm}
                  onChange={(event) => setPagoEm(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aviso-obs">Observação (opcional)</Label>
                <Input
                  id="aviso-obs"
                  placeholder="Ex.: PIX da conta do Banco X"
                  maxLength={280}
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                />
              </div>

              {erro && <p className="text-sm text-destructive">{erro}</p>}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancelar</Button>} />
              <Button onClick={() => enviar.mutate()} disabled={enviar.isPending || valorInvalido}>
                {enviar.isPending ? 'Enviando...' : 'Enviar aviso'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
