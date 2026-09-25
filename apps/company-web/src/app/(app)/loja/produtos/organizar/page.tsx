'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import type { StoreCategory, StoreProduct } from '@motoboycity/types';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  CHAVE_DA_FILA,
  comProdutosReordenados,
  mensagemDoErro,
  mover,
  ordenarPelasCategorias,
  useCatalogo,
  useFilaDoCatalogo,
} from '@/components/loja/catalogo';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { companyStoreCatalogApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Tela separada da lista de produtos de propósito.
 *
 * Ordenar enquanto a lista está filtrada ou buscada é uma armadilha: "mover
 * para cima" moveria o item acima do vizinho VISÍVEL, e não do real, e o
 * resultado na loja seria outro. Aqui não há filtro nem busca — o que se vê é
 * a ordem que o cliente vê.
 *
 * Cada mudança é gravada na hora, sem botão de salvar: a tela já mostra a
 * ordem nova e a API confirma por trás. Se ela recusar, o catálogo é relido e
 * a tela volta ao que ficou gravado, com o motivo escrito no topo.
 */

/**
 * Renomear no lugar, sem tela de edição: a categoria só tem nome, e abrir um
 * formulário para um campo só seria atrito sem contrapartida.
 *
 * Grava ao sair do campo ou no Enter; Esc desiste. O que foi digitado fica no
 * campo até a resposta chegar: soltá-lo antes mostraria, por um instante, o
 * nome antigo — a tela só recebe o nome novo do catálogo um tique depois.
 */
function NomeDaCategoria({
  categoria,
  onErro,
}: {
  categoria: StoreCategory;
  onErro: (texto: string | null) => void;
}) {
  const token = session.getToken();
  const fila = useFilaDoCatalogo();
  const [rascunho, setRascunho] = useState<string | null>(null);

  const renomear = useMutation({
    ...fila.opcoes,
    mutationFn: (name: string) =>
      companyStoreCatalogApi.renameCategory(token as string, categoria.id, { name }),
    onMutate: (name) =>
      fila.mudarNaTela((atual) => ({
        ...atual,
        categories: atual.categories.map((item) =>
          item.id === categoria.id ? { ...item, name } : item,
        ),
      })),
    onError: (falha) => onErro(mensagemDoErro(falha, 'Não foi possível renomear a categoria.')),
    onSettled: (_resposta, _falha, name) => {
      // Se a pessoa já voltou a digitar outra coisa, o rascunho novo fica.
      setRascunho((atual) => (atual !== null && atual.trim() === name ? null : atual));
      fila.depoisDeGravar();
    },
  });

  function confirmar() {
    if (rascunho === null) return;
    const nome = rascunho.trim();
    // Vazio não é nome: volta o que estava, em vez de gravar uma seção sem título.
    if (nome === '' || nome === categoria.name) {
      setRascunho(null);
      return;
    }
    setRascunho(nome);
    onErro(null);
    renomear.mutate(nome);
  }

  return (
    <Input
      value={rascunho ?? categoria.name}
      maxLength={60}
      onChange={(event) => setRascunho(event.target.value)}
      onBlur={confirmar}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmar();
        } else if (event.key === 'Escape') {
          setRascunho(null);
        }
      }}
      aria-label={`Nome da categoria ${categoria.name}`}
      className="min-w-40 flex-1 font-semibold"
    />
  );
}

export default function LojaOrganizarPage() {
  const token = session.getToken();
  const catalogo = useCatalogo();
  const fila = useFilaDoCatalogo();
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const gravando = useIsMutating({ mutationKey: CHAVE_DA_FILA }) > 0;

  const criar = useMutation({
    ...fila.opcoes,
    mutationFn: (name: string) => companyStoreCatalogApi.createCategory(token as string, { name }),
    onSuccess: (categoria) => {
      setNova('');
      fila.mudarNaTela((atual) => ({ ...atual, categories: [...atual.categories, categoria] }));
    },
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível criar a categoria.')),
    onSettled: fila.depoisDeGravar,
  });

  const excluir = useMutation({
    ...fila.opcoes,
    mutationFn: (id: string) => companyStoreCatalogApi.deleteCategory(token as string, id),
    onMutate: (id) =>
      fila.mudarNaTela((atual) => ({
        ...atual,
        categories: atual.categories.filter((categoria) => categoria.id !== id),
      })),
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível excluir a categoria.')),
    onSettled: fila.depoisDeGravar,
  });

  const ordenarCategorias = useMutation({
    ...fila.opcoes,
    mutationFn: (ids: string[]) =>
      companyStoreCatalogApi.reorderCategories(token as string, { ids }),
    onMutate: (ids) =>
      fila.mudarNaTela((atual) => {
        const porId = new Map(atual.categories.map((categoria) => [categoria.id, categoria]));
        const categories = ids.flatMap((id) => porId.get(id) ?? []);
        return { categories, products: ordenarPelasCategorias(atual.products, categories) };
      }),
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível gravar a nova ordem.')),
    onSettled: fila.depoisDeGravar,
  });

  const ordenarProdutos = useMutation({
    ...fila.opcoes,
    mutationFn: (payload: { categoryId: string | null; ids: string[] }) =>
      companyStoreCatalogApi.reorderProducts(token as string, payload),
    onMutate: ({ categoryId, ids }) =>
      fila.mudarNaTela((atual) => comProdutosReordenados(atual, categoryId, ids)),
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível gravar a nova ordem.')),
    onSettled: fila.depoisDeGravar,
  });

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  const categorias = catalogo.data?.categories ?? [];
  const produtos = catalogo.data?.products ?? [];
  const semCategoria = produtos.filter((produto) => produto.categoryId === null);

  function acrescentar() {
    const nome = nova.trim();
    if (nome === '' || criar.isPending) return;
    setErro(null);
    criar.mutate(nome);
  }

  function moverCategoria(indice: number, passo: number) {
    setErro(null);
    ordenarCategorias.mutate(
      mover(
        categorias.map((categoria) => categoria.id),
        indice,
        indice + passo,
      ),
    );
  }

  /** Dentro da categoria: a troca é com o vizinho DA MESMA seção. */
  function moverProduto(daSecao: StoreProduct[], indice: number, passo: number) {
    setErro(null);
    ordenarProdutos.mutate({
      categoryId: daSecao[indice]!.categoryId,
      ids: mover(
        daSecao.map((produto) => produto.id),
        indice,
        indice + passo,
      ),
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/loja/produtos"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Produtos
          </Link>
          <h1 className="text-2xl font-bold">Organizar o catálogo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta é a ordem em que o cliente vê. O que estiver no topo é o que ele encontra primeiro.
          </p>
        </div>
        {catalogo.isSuccess && (
          <span className="text-xs text-muted-foreground" role="status">
            {gravando ? 'Salvando...' : 'Cada mudança é salva na hora.'}
          </span>
        )}
      </header>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}

      {catalogo.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando o catálogo...</p>
      )}

      {catalogo.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar o catálogo.</p>
            <Button type="button" variant="outline" onClick={() => void catalogo.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {catalogo.isSuccess && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Nova categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={nova}
                  maxLength={60}
                  onChange={(event) => setNova(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      acrescentar();
                    }
                  }}
                  placeholder="Ex.: Porções, Sobremesas, Promoções"
                  aria-label="Nome da nova categoria"
                  className="min-w-56 flex-1"
                />
                <Button
                  type="button"
                  onClick={acrescentar}
                  disabled={nova.trim() === '' || criar.isPending}
                >
                  <Plus className="size-4" /> {criar.isPending ? 'Criando...' : 'Acrescentar'}
                </Button>
              </div>
              {categorias.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Nenhuma categoria ainda. Cada categoria vira uma seção da loja — Lanches, Bebidas,
                  Sobremesas — e todo produto precisa de uma para ir ao ar.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {categorias.map((categoria, indice) => {
              const daCategoria = produtos.filter((produto) => produto.categoryId === categoria.id);

              return (
                <Card key={categoria.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex shrink-0 flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1"
                          disabled={indice === 0}
                          aria-label={`Subir a categoria ${categoria.name}`}
                          onClick={() => moverCategoria(indice, -1)}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1"
                          disabled={indice === categorias.length - 1}
                          aria-label={`Descer a categoria ${categoria.name}`}
                          onClick={() => moverCategoria(indice, 1)}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                      </div>

                      <NomeDaCategoria categoria={categoria} onErro={setErro} />

                      <Badge variant="secondary">
                        {daCategoria.length} {daCategoria.length === 1 ? 'produto' : 'produtos'}
                      </Badge>

                      {/* Excluir categoria com produto dentro deixaria todos
                          eles sem seção — invisíveis na loja, sem a loja
                          perceber. O botão só libera vazia, e a API confere. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={daCategoria.length > 0}
                        aria-label={`Excluir a categoria ${categoria.name}`}
                        title={
                          daCategoria.length > 0
                            ? 'Mova os produtos para outra categoria antes de excluir'
                            : undefined
                        }
                        onClick={() => {
                          setErro(null);
                          excluir.mutate(categoria.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {daCategoria.length === 0 ? (
                      <p className="pl-10 text-xs text-muted-foreground">
                        Categoria vazia. Ela não aparece na loja enquanto não tiver produto.
                      </p>
                    ) : (
                      <ul className="space-y-1 pl-10">
                        {daCategoria.map((produto, posicao) => (
                          <li
                            key={produto.id}
                            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate">{produto.name}</span>
                            {produto.status !== 'PUBLISHED' && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {produto.status === 'DRAFT' ? 'Rascunho' : 'Pausado'}
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1"
                              disabled={posicao === 0}
                              aria-label={`Subir o produto ${produto.name}`}
                              onClick={() => moverProduto(daCategoria, posicao, -1)}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1"
                              disabled={posicao === daCategoria.length - 1}
                              aria-label={`Descer o produto ${produto.name}`}
                              onClick={() => moverProduto(daCategoria, posicao, 1)}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Não é uma categoria: é o resto. Não se move nem se exclui, e some
              sozinha quando todo produto tiver seção. */}
          {semCategoria.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-base">Fora de qualquer seção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  A loja é dividida em seções, e cada seção é uma categoria. Estes produtos não
                  estão em nenhuma — <strong>o cliente não tem como chegar neles</strong>.
                </p>
                <ul className="space-y-1">
                  {semCategoria.map((produto) => (
                    <li
                      key={produto.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <span className="flex-1">{produto.name}</span>
                      <Link
                        href={`/loja/produtos/${produto.id}/editar`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Escolher categoria
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
