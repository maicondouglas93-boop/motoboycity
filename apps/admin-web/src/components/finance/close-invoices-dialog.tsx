'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileStack } from 'lucide-react';
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
import { adminInvoicesApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

/**
 * Fechar as faturas da semana, com confirmação.
 *
 * É a ação de maior alcance do painel: gera as faturas de **todas as empresas**
 * de uma vez e prende a elas todas as entregas concluídas ainda não faturadas.
 * Era um botão comum, do lado de outros botões comuns.
 *
 * A confirmação mostra o que vai ser cobrado antes de cobrar — o número já está
 * na tela, no cartão "ainda não faturado", e repeti-lo aqui é o que transforma
 * um clique numa decisão.
 */
export function CloseInvoicesDialog({
  token,
  dataDoFechamento,
  valorAFaturar,
  entregasAFaturar,
  desabilitado,
  onFechado,
}: {
  token: string;
  dataDoFechamento: string;
  valorAFaturar: number | null;
  entregasAFaturar: number | null;
  desabilitado: boolean;
  onFechado: (quantidade: number) => void;
}) {
  const money = useMoney();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const fechar = useMutation({
    mutationFn: () => adminInvoicesApi.close(token, dataDoFechamento),
    onSuccess: (faturas) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'financial'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      setAberto(false);
      setErro(null);
      onFechado(faturas.length);
    },
    onError: (error) =>
      setErro(
        error instanceof ApiError ? error.message : 'Não foi possível fechar as faturas.',
      ),
  });

  /** Sem entrega pendente, o fechamento não tem o que cobrar. */
  const nadaAFaturar = entregasAFaturar === 0;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button disabled={desabilitado}>
            <FileStack aria-hidden className="size-4" />
            Fechar faturas da semana
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fechar as faturas de {formatarData(dataDoFechamento)}</DialogTitle>
          <DialogDescription>
            Vale para todas as empresas com entrega concluída e ainda não faturada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            O que vai virar cobranca, em numero. Sem isto o admin confirma no
            escuro uma acao que atinge todos os clientes de uma vez.
          */}
          <div className="rounded-lg bg-dinheiro-nao-cobrado-suave p-3">
            <p className="text-sm text-muted-foreground">O que será faturado agora</p>
            <p className="font-mono text-2xl font-semibold text-dinheiro-nao-cobrado">
              {valorAFaturar === null ? '—' : money(valorAFaturar)}
            </p>
            <p className="text-xs text-muted-foreground">
              {entregasAFaturar === null
                ? 'carregando...'
                : `${formatarNumero(entregasAFaturar)} entrega(s) concluída(s) sem fatura`}
            </p>
          </div>

          <div className="rounded-lg bg-dinheiro-aguardando-suave p-3 text-sm">
            <p className="font-medium text-dinheiro-aguardando">O que acontece</p>
            <p className="mt-1 text-muted-foreground">
              Cada empresa recebe uma fatura com os pedidos dela, vencendo hoje mesmo. Para
              desfazer é preciso <strong>cancelar fatura por fatura</strong> — o cancelamento
              devolve os pedidos para cobrança, mas o número da fatura fica registrado.
            </p>
          </div>

          {nadaAFaturar && (
            <p className="text-sm text-muted-foreground">
              Não há entrega aguardando fatura. Fechar agora não gera nada.
            </p>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Voltar</Button>} />
          <Button onClick={() => fechar.mutate()} disabled={fechar.isPending || nadaAFaturar}>
            {fechar.isPending ? 'Fechando...' : 'Confirmar fechamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
