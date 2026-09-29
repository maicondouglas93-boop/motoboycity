'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Megaphone, Plus, Tag, Ticket } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  situacaoDaPromocao,
  situacaoDoCupom,
  useCupons,
  usePromocoes,
} from '@/components/loja/marketing';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

/**
 * A visão geral do Marketing: quantas promoções estão no ar, quantas vão
 * começar, quantas vezes já valeram, e o caminho para criar a próxima.
 */
export default function MarketingPage() {
  const token = session.getToken();
  const promocoes = usePromocoes();
  const cupons = useCupons();
  const instante = useAgora();

  const resumo = useMemo(() => {
    const lista = promocoes.data ?? [];
    const agora = new Date(instante);
    const situacoes = lista.map((promocao) => situacaoDaPromocao(promocao, agora).codigo);
    const listaDeCupons = cupons.data ?? [];
    const cupomNoAr = listaDeCupons.filter(
      (cupom) => situacaoDoCupom(cupom, agora).codigo === 'NO_AR',
    ).length;
    return {
      noAr: situacoes.filter((codigo) => codigo === 'NO_AR').length,
      agendadas: situacoes.filter((codigo) => codigo === 'AGENDADA').length,
      usos: lista.reduce((soma, promocao) => soma + promocao.usos, 0),
      total: lista.length,
      cuponsNoAr: cupomNoAr,
      cuponsUsos: listaDeCupons.reduce((soma, cupom) => soma + cupom.usos, 0),
      cuponsTotal: listaDeCupons.length,
    };
  }, [promocoes.data, cupons.data, instante]);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  return (
    <div className="space-y-5">
      <header>
        <h1>Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Promoções que aparecem no cardápio com o preço &ldquo;De / Por&rdquo; e já entram no total
          do pedido.
        </p>
      </header>

      {promocoes.isLoading && (
        <div className="grid gap-3 sm:grid-cols-3" role="status">
          <span className="sr-only">Carregando o resumo...</span>
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {promocoes.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar o resumo.</p>
            <Button type="button" variant="outline" onClick={() => void promocoes.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {promocoes.isSuccess && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { rotulo: 'No ar agora', valor: resumo.noAr },
            { rotulo: 'Agendadas', valor: resumo.agendadas },
            { rotulo: 'Pedidos com promoção', valor: resumo.usos },
          ].map(({ rotulo, valor }) => (
            <Card key={rotulo} className="gap-0 py-0">
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">{rotulo}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{valor}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Tag className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-56 flex-1">
            <h2 className="text-base font-semibold">Promoções</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Desconto em %, preço promocional, leve mais pague menos ou segundo item com desconto —
              num produto ou numa seção inteira, com data, horário e limite.
            </p>
            {promocoes.isSuccess && resumo.total === 0 && (
              <p className="mt-1 text-sm">
                <Megaphone className="mr-1 inline size-3.5" aria-hidden="true" />
                Você ainda não criou nenhuma. A primeira leva um minuto.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/loja/marketing/promocoes"
              className={buttonVariants({ variant: 'outline' })}
            >
              Ver promoções
            </Link>
            <Link
              href="/loja/marketing/promocoes/nova"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <Plus className="size-4" /> Nova promoção
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Ticket className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-56 flex-1">
            <h2 className="text-base font-semibold">Cupons</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Um código que o cliente digita no checkout: % ou valor fixo, com pedido mínimo,
              período e limite por cliente. Só desconta os itens sem promoção.
            </p>
            {cupons.isSuccess && (
              <p className="mt-1 text-sm">
                {resumo.cuponsTotal === 0 ? (
                  <>
                    <Megaphone className="mr-1 inline size-3.5" aria-hidden="true" />
                    Você ainda não criou nenhum.
                  </>
                ) : (
                  <>
                    {resumo.cuponsNoAr} no ar · {resumo.cuponsUsos}{' '}
                    {resumo.cuponsUsos === 1 ? 'pedido usou' : 'pedidos usaram'} cupom
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/loja/marketing/cupons" className={buttonVariants({ variant: 'outline' })}>
              Ver cupons
            </Link>
            <Link
              href="/loja/marketing/cupons/nova"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <Plus className="size-4" /> Novo cupom
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
