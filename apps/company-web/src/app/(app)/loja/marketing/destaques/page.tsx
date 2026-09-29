'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DestaqueDaLoja } from '@motoboycity/types';
import { ArrowDown, ArrowUp, CopyPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { mensagemDoErro, mover, useCatalogo } from '@/components/loja/catalogo';
import {
  CHAVE_DA_ORDEM_DOS_DESTAQUES,
  CHAVE_DOS_DESTAQUES,
  periodoDoDestaque,
  situacaoDoDestaque,
  useDestaques,
} from '@/components/loja/marketing';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

/** As gravações da ordem correm uma de cada vez: quem sobe três vezes seguidas manda três listas. */
const FILA_DA_ORDEM = { id: 'company-store-highlights-order' };

export default function DestaquesPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const destaques = useDestaques();
  const catalogo = useCatalogo();
  const instante = useAgora();
  const [erro, setErro] = useState<string | null>(null);
  // A exclusão pede um segundo toque: apagar um destaque não tem volta.
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_DOS_DESTAQUES });

  const ligar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; titulo: string; ativo: boolean }) =>
      companyStoreMarketingApi.setHighlightActive(token as string, id, ativo),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { titulo }) => {
      setErro(`${titulo}: ${mensagemDoErro(falha, 'não foi possível mudar o destaque.')}`);
      void atualizar();
    },
  });

  const duplicar = useMutation({
    mutationFn: ({ id }: { id: string; titulo: string }) =>
      companyStoreMarketingApi.duplicateHighlight(token as string, id),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { titulo }) =>
      setErro(`${titulo}: ${mensagemDoErro(falha, 'não foi possível duplicar.')}`),
  });

  const excluir = useMutation({
    mutationFn: ({ id }: { id: string; titulo: string }) =>
      companyStoreMarketingApi.deleteHighlight(token as string, id),
    onSuccess: () => {
      setErro(null);
      setConfirmando(null);
      void atualizar();
    },
    onError: (falha, { titulo }) => {
      setConfirmando(null);
      setErro(`${titulo}: ${mensagemDoErro(falha, 'não foi possível excluir.')}`);
      void atualizar();
    },
  });

  const ordenar = useMutation({
    mutationKey: CHAVE_DA_ORDEM_DOS_DESTAQUES,
    scope: FILA_DA_ORDEM,
    mutationFn: (ids: string[]) => companyStoreMarketingApi.reorderHighlights(token as string, ids),
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível mudar a ordem.')),
    // A última gravação da fila relê a lista: se alguma foi recusada, a tela volta ao que
    // ficou gravado. Contar 1 é contar a própria gravação.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: CHAVE_DA_ORDEM_DOS_DESTAQUES }) === 1) {
        void atualizar();
      }
    },
  });

  const lista = useMemo(() => destaques.data ?? [], [destaques.data]);
  const agora = useMemo(() => new Date(instante), [instante]);
  const nomesDosProdutos = useMemo(
    () => new Map((catalogo.data?.products ?? []).map((produto) => [produto.id, produto.name])),
    [catalogo.data],
  );

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  /**
   * Sobe ou desce um destaque. A tela muda antes da resposta (cancelar a leitura em
   * andamento impede que ela chegue depois com a ordem antiga e desfaça o que se acabou de
   * ver), e a lista mandada é sempre a inteira, a partir do que a tela mostra agora.
   */
  function mudarDeLugar(id: string, passo: number) {
    const atuais = queryClient.getQueryData<DestaqueDaLoja[]>(CHAVE_DOS_DESTAQUES) ?? lista;
    const de = atuais.findIndex((item) => item.id === id);
    if (de < 0) return;
    const novos = mover(atuais, de, de + passo).map((item, indice) => ({
      ...item,
      posicao: indice,
    }));
    setErro(null);
    void queryClient.cancelQueries({ queryKey: CHAVE_DOS_DESTAQUES });
    queryClient.setQueryData<DestaqueDaLoja[]>(CHAVE_DOS_DESTAQUES, novos);
    ordenar.mutate(novos.map((item) => item.id));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Destaques</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Blocos no alto do cardápio, na ordem desta lista: suba e desça para mudar quem vem
            primeiro.
          </p>
        </div>
        <Link href="/loja/marketing/destaques/nova" className={buttonVariants()}>
          <Plus className="size-4" /> Novo destaque
        </Link>
      </header>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}

      {destaques.isLoading && (
        <div className="space-y-px overflow-hidden rounded-lg border" role="status">
          <span className="sr-only">Carregando destaques...</span>
          <Skeleton className="h-20 rounded-none" />
          <Skeleton className="h-20 rounded-none" />
        </div>
      )}

      {destaques.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar os destaques.</p>
            <Button type="button" variant="outline" onClick={() => void destaques.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {destaques.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nenhum destaque ainda.</p>
            <p>
              Crie o primeiro — &ldquo;Mais pedidos&rdquo;, por exemplo — e escolha os produtos:
              eles aparecem no alto do cardápio, antes das seções.
            </p>
            <Link href="/loja/marketing/destaques/nova" className={buttonVariants()}>
              <Plus className="size-4" /> Criar destaque
            </Link>
          </CardContent>
        </Card>
      )}

      {destaques.isSuccess && lista.length > 0 && (
        <Card className="gap-0 divide-y py-0">
          {lista.map((destaque, indice) => {
            const situacao = situacaoDoDestaque(destaque, agora);
            const periodo = periodoDoDestaque(destaque);
            const nomes = destaque.produtoIds.flatMap((id) => {
              const nome = nomesDosProdutos.get(id);
              return nome ? [nome] : [];
            });
            const ocupado =
              (ligar.isPending && ligar.variables?.id === destaque.id) ||
              (duplicar.isPending && duplicar.variables?.id === destaque.id) ||
              (excluir.isPending && excluir.variables?.id === destaque.id);
            return (
              <div key={destaque.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Subir ${destaque.titulo}`}
                    disabled={indice === 0}
                    onClick={() => mudarDeLugar(destaque.id, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Descer ${destaque.titulo}`}
                    disabled={indice === lista.length - 1}
                    onClick={() => mudarDeLugar(destaque.id, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>

                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {indice + 1}º
                    </span>
                    <span className="font-semibold">{destaque.titulo}</span>
                    <Badge className={situacao.classe} variant="secondary">
                      {situacao.texto}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {nomes.length === 0
                      ? 'Sem produtos (os escolhidos foram apagados).'
                      : `${nomes.length} ${nomes.length === 1 ? 'produto' : 'produtos'}: ${nomes.join(', ')}`}
                  </p>
                  {periodo && <p className="mt-0.5 text-xs text-muted-foreground">{periodo}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() =>
                      ligar.mutate({
                        id: destaque.id,
                        titulo: destaque.titulo,
                        ativo: !destaque.ativo,
                      })
                    }
                  >
                    {destaque.ativo ? 'Desligar' : 'Ligar'}
                  </Button>
                  <Link
                    href={`/loja/marketing/destaques/${destaque.id}/editar`}
                    aria-label={`Editar ${destaque.titulo}`}
                    title="Editar"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    <Pencil className="size-4" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado}
                    aria-label={`Duplicar ${destaque.titulo}`}
                    title="Duplicar"
                    onClick={() => duplicar.mutate({ id: destaque.id, titulo: destaque.titulo })}
                  >
                    <CopyPlus className="size-4" />
                  </Button>
                  {confirmando === destaque.id ? (
                    <>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => excluir.mutate({ id: destaque.id, titulo: destaque.titulo })}
                      >
                        Confirmar exclusão
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmando(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      aria-label={`Excluir ${destaque.titulo}`}
                      title="Excluir"
                      onClick={() => setConfirmando(destaque.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
