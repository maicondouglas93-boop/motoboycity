'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MetricCard } from '@/components/finance/metric-card';
import { adminFinancialApi } from '@/lib/api-client';
import { formatarData, formatarNumero } from '@/lib/dinheiro';
import { useMoney } from '@/lib/money';

/** `AAAA-MM-DD` de N dias atrás, no fuso da operação. */
function diasAtras(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function RecebimentosTab({ token }: { token: string }) {
  const money = useMoney();
  /**
   * Abre com os últimos 30 dias em vez de vazio.
   *
   * Extrato sem período não tem resposta útil, e uma tela pedindo dois campos
   * antes de mostrar qualquer coisa faz o admin desistir. Trinta dias é o
   * recorte que ele quase sempre quer.
   */
  const [de, setDe] = useState(() => diasAtras(30));
  const [ate, setAte] = useState(() => diasAtras(0));
  const [somenteOnline, setSomenteOnline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(() => ({
    from: diasAtras(30),
    to: diasAtras(0),
    onlineOnly: false,
  }));

  const extratoQuery = useQuery({
    queryKey: ['admin', 'financial', 'receipts', filtro],
    queryFn: () => adminFinancialApi.receipts(token, filtro),
  });

  function aplicar() {
    if (de > ate) {
      setErro('A data inicial não pode ser posterior à data final.');
      return;
    }
    setErro(null);
    setFiltro({ from: de, to: ate, onlineOnly: somenteOnline });
  }

  const extrato = extratoQuery.data;
  const quantidadeDeLinhas = extrato?.days.reduce((soma, dia) => soma + dia.receipts.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Extrato de recebimentos</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Faturas quitadas no período, agrupadas pelo dia do pagamento.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="extrato-de">De</Label>
              <Input
                id="extrato-de"
                type="date"
                className="w-44"
                value={de}
                onChange={(evento) => setDe(evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extrato-ate">Até</Label>
              <Input
                id="extrato-ate"
                type="date"
                className="w-44"
                value={ate}
                onChange={(evento) => setAte(evento.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={somenteOnline}
                onCheckedChange={(marcado) => setSomenteOnline(marcado === true)}
              />
              Somente pagos online
            </label>
            <Button onClick={aplicar}>Aplicar</Button>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {extrato && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Total recebido no período"
                value={money(extrato.total)}
                hint={`${formatarNumero(quantidadeDeLinhas)} fatura(s) quitada(s)`}
                intent="recebido"
                icon={CircleDollarSign}
              />
              <MetricCard
                label="Dias com recebimento"
                value={formatarNumero(extrato.days.length)}
                intent="informativo"
                icon={Landmark}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {extratoQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando o extrato...</p>
      ) : extratoQuery.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar o extrato.</p>
      ) : !extrato || extrato.days.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">Nenhum recebimento neste período.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Só entram faturas com pagamento confirmado. Fatura em aberto aparece na aba Faturas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {extrato.days.map((dia) => (
            <Card key={dia.day}>
              {/*
                O total do dia fica no CABEÇALHO, e não no rodapé da lista: é o
                número que o admin procura ao conferir contra o extrato do banco,
                e no rodapé ele obrigaria a rolar a lista inteira.
              */}
              <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border py-3">
                <CardTitle className="text-sm font-semibold">{formatarData(dia.day)}</CardTitle>
                <span className="font-mono text-sm font-semibold text-dinheiro-recebido tabular-nums">
                  {money(dia.total)}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {dia.receipts.map((recebimento) => (
                    <li
                      key={recebimento.invoiceId}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/faturas/${recebimento.invoiceId}`}
                          className="text-sm font-medium text-admin hover:underline"
                        >
                          Fatura {recebimento.invoiceNumber}
                        </Link>
                        <p className="truncate text-sm text-muted-foreground">
                          {recebimento.companyName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-dinheiro-retido-suave px-2.5 py-0.5 text-xs text-muted-foreground">
                          {recebimento.paymentMethod === 'ONLINE' ? 'Online' : 'Faturado'}
                        </span>
                        <span className="font-mono text-sm tabular-nums">
                          {money(recebimento.amount)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
