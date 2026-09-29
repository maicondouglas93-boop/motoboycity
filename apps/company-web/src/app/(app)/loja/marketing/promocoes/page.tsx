'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PromocaoDaLoja } from '@motoboycity/types';
import { Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { mensagemDoErro, useCatalogo } from '@/components/loja/catalogo';
import {
  CHAVE_DAS_PROMOCOES,
  NOMES_DOS_TIPOS,
  descricaoDaPromocao,
  quandoVale,
  situacaoDaPromocao,
  usePromocoes,
  type CodigoDaSituacao,
} from '@/components/loja/marketing';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

type Filtro = 'todas' | CodigoDaSituacao;

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'NO_AR', texto: 'No ar' },
  { valor: 'AGENDADA', texto: 'Agendadas' },
  { valor: 'DESLIGADA', texto: 'Desligadas' },
  { valor: 'ENCERRADA', texto: 'Encerradas' },
  { valor: 'ESGOTADA', texto: 'Esgotadas' },
];

export default function PromocoesPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const promocoes = usePromocoes();
  const catalogo = useCatalogo();
  const instante = useAgora();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [erro, setErro] = useState<string | null>(null);
  // A exclusão pede um segundo toque: apagar uma promoção não tem volta.
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_DAS_PROMOCOES });

  const ligar = useMutation({
    mutationFn: ({ id, ativa }: { id: string; nome: string; ativa: boolean }) =>
      companyStoreMarketingApi.setPromotionActive(token as string, id, ativa),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { nome }) => {
      setErro(`${nome}: ${mensagemDoErro(falha, 'não foi possível mudar a promoção.')}`);
      void atualizar();
    },
  });

  const duplicar = useMutation({
    mutationFn: ({ id }: { id: string; nome: string }) =>
      companyStoreMarketingApi.duplicatePromotion(token as string, id),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { nome }) =>
      setErro(`${nome}: ${mensagemDoErro(falha, 'não foi possível duplicar.')}`),
  });

  const excluir = useMutation({
    mutationFn: ({ id }: { id: string; nome: string }) =>
      companyStoreMarketingApi.deletePromotion(token as string, id),
    onSuccess: () => {
      setErro(null);
      setConfirmando(null);
      void atualizar();
    },
    onError: (falha, { nome }) => {
      setConfirmando(null);
      setErro(`${nome}: ${mensagemDoErro(falha, 'não foi possível excluir.')}`);
      void atualizar();
    },
  });

  const lista = useMemo(() => promocoes.data ?? [], [promocoes.data]);
  const agora = useMemo(() => new Date(instante), [instante]);

  const comSituacao = useMemo(
    () => lista.map((promocao) => ({ promocao, situacao: situacaoDaPromocao(promocao, agora) })),
    [lista, agora],
  );

  // Onde cada promoção vale, pelo nome — o painel guarda só o id.
  const nomeDoAlvo = (promocao: PromocaoDaLoja): string => {
    if (promocao.alvo === 'PRODUTO') {
      return (
        catalogo.data?.products.find((produto) => produto.id === promocao.produtoId)?.name ??
        'Produto'
      );
    }
    const secao = catalogo.data?.categories.find((item) => item.id === promocao.categoriaId);
    return secao ? `Seção ${secao.name}` : 'Seção';
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comSituacao.filter(({ promocao, situacao }) => {
      const casaBusca = !termo || promocao.nome.toLowerCase().includes(termo);
      const casaFiltro = filtro === 'todas' || situacao.codigo === filtro;
      return casaBusca && casaFiltro;
    });
  }, [comSituacao, busca, filtro]);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  const contar = (valor: Filtro) =>
    valor === 'todas'
      ? comSituacao.length
      : comSituacao.filter(({ situacao }) => situacao.codigo === valor).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Promoções</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As que estão no ar aparecem no cardápio com o preço &ldquo;De / Por&rdquo;.
          </p>
        </div>
        <Link href="/loja/marketing/promocoes/nova" className={buttonVariants()}>
          <Plus className="size-4" /> Nova promoção
        </Link>
      </header>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}

      {promocoes.isLoading && (
        <div className="space-y-px overflow-hidden rounded-lg border" role="status">
          <span className="sr-only">Carregando promoções...</span>
          <Skeleton className="h-20 rounded-none" />
          <Skeleton className="h-20 rounded-none" />
          <Skeleton className="h-20 rounded-none" />
        </div>
      )}

      {promocoes.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar as promoções.</p>
            <Button type="button" variant="outline" onClick={() => void promocoes.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {promocoes.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nenhuma promoção ainda.</p>
            <p>
              Crie a primeira: escolha um produto, o desconto e pronto — o cardápio já mostra o
              preço &ldquo;De / Por&rdquo;.
            </p>
            <Link href="/loja/marketing/promocoes/nova" className={buttonVariants()}>
              <Plus className="size-4" /> Criar promoção
            </Link>
          </CardContent>
        </Card>
      )}

      {promocoes.isSuccess && lista.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1">
            {FILTROS.map(({ valor, texto }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2.5 ${
                  filtro === valor
                    ? 'bg-accent font-semibold text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {texto} ({contar(valor)})
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar promoção..."
              aria-label="Buscar promoção"
              className="pl-9"
            />
          </div>

          <Card className="gap-0 divide-y py-0">
            {visiveis.map(({ promocao, situacao }) => {
              const quando = quandoVale(promocao);
              const ocupada =
                (ligar.isPending && ligar.variables?.id === promocao.id) ||
                (duplicar.isPending && duplicar.variables?.id === promocao.id) ||
                (excluir.isPending && excluir.variables?.id === promocao.id);
              return (
                <div key={promocao.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-56 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{promocao.nome}</span>
                      <Badge className={situacao.classe} variant="secondary">
                        {situacao.texto}
                      </Badge>
                      {situacao.foraDoHorario && (
                        <span className="text-xs text-muted-foreground">fora do horário agora</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm">
                      {descricaoDaPromocao(promocao)}{' '}
                      <span className="text-muted-foreground">· {nomeDoAlvo(promocao)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {NOMES_DOS_TIPOS[promocao.tipo]}
                      {quando ? ` · ${quando}` : ' · sempre que estiver ligada'}
                      {promocao.limiteDeUsos !== null
                        ? ` · ${promocao.usos} de ${promocao.limiteDeUsos} usos`
                        : promocao.usos > 0
                          ? ` · ${promocao.usos} ${promocao.usos === 1 ? 'uso' : 'usos'}`
                          : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupada}
                      onClick={() =>
                        ligar.mutate({
                          id: promocao.id,
                          nome: promocao.nome,
                          ativa: !promocao.ativa,
                        })
                      }
                    >
                      {promocao.ativa ? 'Desligar' : 'Ligar'}
                    </Button>
                    <Link
                      href={`/loja/marketing/promocoes/${promocao.id}/editar`}
                      aria-label={`Editar ${promocao.nome}`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupada}
                      aria-label={`Duplicar ${promocao.nome}`}
                      onClick={() => duplicar.mutate({ id: promocao.id, nome: promocao.nome })}
                    >
                      <Copy className="size-4" />
                    </Button>
                    {confirmando === promocao.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={ocupada}
                          onClick={() => excluir.mutate({ id: promocao.id, nome: promocao.nome })}
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
                        disabled={ocupada}
                        aria-label={`Excluir ${promocao.nome}`}
                        onClick={() => setConfirmando(promocao.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {visiveis.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium">Nenhuma promoção encontrada.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mude o filtro ou a busca para ver as outras.
                </p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
