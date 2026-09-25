'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StoreCatalog, StoreProduct, StoreProductStatus } from '@motoboycity/types';
import { storeProductIssues } from '@motoboycity/validation';
import { AlertTriangle, ArrowUpDown, ImageOff, Pencil, Plus, Search } from 'lucide-react';
import {
  CHAVE_DO_CATALOGO,
  SITUACOES,
  faixaDePreco,
  mensagemDoErro,
  useCatalogo,
} from '@/components/loja/catalogo';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { companyStoreCatalogApi } from '@/lib/api-client';
import { session } from '@/lib/session';

type Filtro = 'todos' | StoreProductStatus | 'problemas';

/** Resume o que o cliente vai poder escolher, sem abrir o produto. */
function resumoDeOpcoes(produto: StoreProduct): string | null {
  const partes: string[] = [];
  if (produto.sizes.length > 0) {
    partes.push(`${produto.sizes.length} ${produto.sizes.length === 1 ? 'tamanho' : 'tamanhos'}`);
  }
  const escolhas = produto.optionGroups.reduce((soma, grupo) => soma + grupo.options.length, 0);
  if (escolhas > 0) {
    partes.push(`${escolhas} ${escolhas === 1 ? 'escolha' : 'escolhas'}`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

export default function LojaProdutosPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const catalogo = useCatalogo();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [erro, setErro] = useState<string | null>(null);

  const situacao = useMutation({
    mutationFn: ({ id, status }: { id: string; nome: string; status: StoreProductStatus }) =>
      companyStoreCatalogApi.updateProductStatus(token as string, id, { status }),
    onSuccess: (atualizado) => {
      setErro(null);
      queryClient.setQueryData<StoreCatalog>(
        CHAVE_DO_CATALOGO,
        (atual) =>
          atual && {
            ...atual,
            products: atual.products.map((produto) =>
              produto.id === atualizado.id ? atualizado : produto,
            ),
          },
      );
    },
    onError: (falha, { nome }) => {
      setErro(`${nome}: ${mensagemDoErro(falha, 'não foi possível mudar a situação.')}`);
      // Recusado porque mudou noutra aba, ou foi excluído: a lista se acerta.
      void queryClient.invalidateQueries({ queryKey: CHAVE_DO_CATALOGO });
    },
  });

  const produtos = useMemo(() => catalogo.data?.products ?? [], [catalogo.data]);
  const categorias = useMemo(() => catalogo.data?.categories ?? [], [catalogo.data]);

  const comPendencias = useMemo(
    () =>
      produtos.map((produto) => {
        const pendencias = storeProductIssues(produto);
        return {
          produto,
          bloqueiam: pendencias.filter((item) => item.blocking),
          leves: pendencias.filter((item) => !item.blocking),
        };
      }),
    [produtos],
  );

  /**
   * O alarme conta só os PUBLICADOS que travam a venda.
   *
   * Um rascunho sem preço não é problema: rascunho é justamente o produto
   * inacabado. Misturar os dois faria o aviso disparar o tempo todo para uma
   * situação normal, e aí ninguém mais o lê quando um produto no ar quebra.
   *
   * O servidor não deixa publicar produto que trava a venda, então isto só
   * acende se a regra ficar mais exigente depois de o produto ir ao ar.
   */
  const quebrados = comPendencias.filter(
    (item) => item.produto.status === 'PUBLISHED' && item.bloqueiam.length > 0,
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comPendencias.filter(({ produto, bloqueiam }) => {
      const casaBusca = !termo || produto.name.toLowerCase().includes(termo);
      const casaCategoria = !categoria || produto.categoryId === categoria;
      const casaFiltro =
        filtro === 'todos'
          ? true
          : filtro === 'problemas'
            ? produto.status === 'PUBLISHED' && bloqueiam.length > 0
            : produto.status === filtro;
      return casaBusca && casaCategoria && casaFiltro;
    });
  }, [busca, categoria, filtro, comPendencias]);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  const contar = (status: StoreProductStatus) =>
    produtos.filter((produto) => produto.status === status).length;

  const filtros: Array<{ valor: Filtro; texto: string }> = [
    { valor: 'todos', texto: `Todos (${produtos.length})` },
    { valor: 'PUBLISHED', texto: `No ar (${contar('PUBLISHED')})` },
    { valor: 'DRAFT', texto: `Rascunhos (${contar('DRAFT')})` },
    { valor: 'PAUSED', texto: `Pausados (${contar('PAUSED')})` },
  ];

  function mudarSituacao(produto: StoreProduct, status: StoreProductStatus) {
    setErro(null);
    situacao.mutate({ id: produto.id, nome: produto.name, status });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que sua loja vende. Um produto por item do cardápio — os tamanhos ficam dentro dele.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/loja/produtos/organizar" className={buttonVariants({ variant: 'outline' })}>
            <ArrowUpDown className="size-4" /> Organizar
          </Link>
          <Link href="/loja/produtos/novo" className={buttonVariants()}>
            <Plus className="size-4" /> Cadastrar produto
          </Link>
        </div>
      </header>

      {/* A página do cliente mostra o cardápio, mas ainda não recebe pedido. Ver
          AGENTS.md, regra 8: nada de apresentar como integrado o que não está. */}
      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Os produtos publicados aparecem na página da sua loja, no link que você cria em
          Configurações. A página ainda não recebe pedidos.
        </CardContent>
      </Card>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}

      {catalogo.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando produtos...</p>
      )}

      {catalogo.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar os produtos.</p>
            <Button type="button" variant="outline" onClick={() => void catalogo.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loja nova: sem produto nenhum. Todo produto precisa de uma seção
          para ir ao ar, então quem ainda não tem seção começa por ela. */}
      {catalogo.isSuccess && produtos.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nenhum produto cadastrado ainda.</p>
            {categorias.length === 0 ? (
              <p>
                Comece pelas seções da loja — Lanches, Bebidas, Sobremesas — em Organizar. Todo
                produto precisa de uma para ir ao ar.
              </p>
            ) : (
              <p>Cadastre o primeiro item do cardápio.</p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {categorias.length === 0 && (
                <Link
                  href="/loja/produtos/organizar"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Criar seções
                </Link>
              )}
              <Link href="/loja/produtos/novo" className={buttonVariants()}>
                <Plus className="size-4" /> Cadastrar produto
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {catalogo.isSuccess && produtos.length > 0 && (
        <>
          {/* Produto no ar que o cliente não consegue comprar. A loja não
              descobre isso sozinha: o sintoma é a venda que não entra. */}
          {quebrados.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                <span className="flex-1">
                  <strong>
                    {quebrados.length === 1
                      ? '1 produto está no ar e não pode ser comprado'
                      : `${quebrados.length} produtos estão no ar e não podem ser comprados`}
                  </strong>{' '}
                  — o cliente abre, tenta e não consegue fechar o pedido.
                </span>
                <Button variant="outline" size="sm" onClick={() => setFiltro('problemas')}>
                  Ver quais
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {filtros.map((item) => (
              <button
                key={item.valor}
                type="button"
                onClick={() => setFiltro(item.valor)}
                aria-pressed={filtro === item.valor}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  filtro === item.valor
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {item.texto}
              </button>
            ))}
            {filtro === 'problemas' && (
              <button
                type="button"
                onClick={() => setFiltro('todos')}
                className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-sm font-semibold text-destructive"
              >
                Não podem ser comprados ({quebrados.length}) — limpar filtro
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar produto..."
                aria-label="Buscar produto"
                className="pl-9"
              />
            </div>
            <select
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
              aria-label="Filtrar por categoria"
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {lista.map(({ produto, bloqueiam, leves }) => {
              const opcoes = resumoDeOpcoes(produto);
              const rotulo = SITUACOES[produto.status];
              const noArQuebrado = produto.status === 'PUBLISHED' && bloqueiam.length > 0;
              const nomeDaCategoria =
                categorias.find((item) => item.id === produto.categoryId)?.name ?? null;
              const mudando = situacao.isPending && situacao.variables?.id === produto.id;

              return (
                <Card
                  key={produto.id}
                  className={noArQuebrado ? 'border-destructive/40' : undefined}
                >
                  <CardContent className="flex flex-wrap items-center gap-4 py-4">
                    {/* Miniatura, e não cartão com foto grande: produto sem
                        foto continua íntegro em vez de virar um buraco. */}
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {produto.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={produto.imageUrl}
                          alt=""
                          className="size-14 rounded-lg object-cover"
                        />
                      ) : (
                        <ImageOff className="size-5 text-muted-foreground/60" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-48 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{produto.name}</span>
                        <Badge className={rotulo.classe} variant="secondary">
                          {rotulo.texto}
                        </Badge>
                        {nomeDaCategoria ? (
                          <Badge variant="outline">{nomeDaCategoria}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem categoria
                          </Badge>
                        )}
                      </div>
                      {produto.description && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {produto.description}
                        </p>
                      )}
                      {opcoes && <p className="mt-0.5 text-xs text-muted-foreground">{opcoes}</p>}

                      {/* As que travam a venda aparecem por extenso; as demais,
                          resumidas numa linha só. Dar a "sem descrição" o mesmo
                          destaque de "sem preço" faria as duas serem ignoradas. */}
                      {bloqueiam.map((item) => (
                        <p
                          key={item.text}
                          className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
                        >
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          {item.text}
                        </p>
                      ))}
                      {leves.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Falta ainda: {leves.map((item) => item.text).join(', ')}.
                        </p>
                      )}
                    </div>

                    <p className="font-semibold">{faixaDePreco(produto)}</p>

                    <div className="flex items-center gap-1">
                      {produto.status === 'PUBLISHED' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={mudando}
                          onClick={() => mudarSituacao(produto, 'PAUSED')}
                        >
                          Pausar
                        </Button>
                      ) : (
                        /* Publicar com pendência que trava a venda seria pôr no
                           ar um produto que ninguém consegue comprar — e o
                           servidor recusaria de todo jeito. */
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={mudando || bloqueiam.length > 0}
                          title={
                            bloqueiam.length > 0
                              ? 'Resolva o que está em vermelho para poder publicar'
                              : undefined
                          }
                          onClick={() => mudarSituacao(produto, 'PUBLISHED')}
                        >
                          {produto.status === 'DRAFT' ? 'Publicar' : 'Voltar a vender'}
                        </Button>
                      )}
                      <Link
                        href={`/loja/produtos/${produto.id}/editar`}
                        aria-label={`Editar ${produto.name}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        <Pencil className="size-4" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {lista.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum produto encontrado com esse filtro.
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
