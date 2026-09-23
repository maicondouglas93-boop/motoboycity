'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CATEGORIAS_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  type CategoriaDeExemplo,
  type ProdutoDeExemplo,
} from '@/lib/loja-mock';

/**
 * Tela separada da lista de produtos de propósito.
 *
 * Ordenar enquanto a lista está filtrada ou buscada é uma armadilha: "mover
 * para cima" moveria o item acima do vizinho VISÍVEL, e não do real, e o
 * resultado na loja seria outro. Aqui não há filtro nem busca — o que se vê é
 * a ordem que o cliente vê.
 */

/** Move um item do array e devolve uma cópia. Fora do intervalo, devolve o mesmo. */
function mover<T>(itens: T[], de: number, para: number): T[] {
  if (para < 0 || para >= itens.length) return itens;
  const copia = [...itens];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item!);
  return copia;
}

function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function LojaOrganizarPage() {
  const [categorias, setCategorias] = useState<CategoriaDeExemplo[]>(CATEGORIAS_DE_EXEMPLO);
  const [produtos, setProdutos] = useState<ProdutoDeExemplo[]>(PRODUTOS_DE_EXEMPLO);
  const [nova, setNova] = useState('');

  const semCategoria = produtos.filter((produto) => produto.categoriaId === null);

  function acrescentar() {
    const nome = nova.trim();
    if (nome === '') return;
    setCategorias((atual) => [...atual, { id: novoId(), nome }]);
    setNova('');
  }

  function renomear(id: string, nome: string) {
    setCategorias((atual) =>
      atual.map((categoria) => (categoria.id === id ? { ...categoria, nome } : categoria)),
    );
  }

  function excluir(id: string) {
    setCategorias((atual) => atual.filter((categoria) => categoria.id !== id));
  }

  function moverCategoria(indice: number, passo: number) {
    setCategorias((atual) => mover(atual, indice, indice + passo));
  }

  /**
   * A ordem dos produtos é a ordem no array geral. Para mover dentro de uma
   * categoria, a troca é com o vizinho DA MESMA categoria — e não com o índice
   * adjacente, que pode pertencer a outra seção.
   */
  function moverProduto(id: string, passo: number) {
    setProdutos((atual) => {
      const alvo = atual.find((produto) => produto.id === id);
      if (!alvo) return atual;

      const irmaos = atual.filter((produto) => produto.categoriaId === alvo.categoriaId);
      const posicao = irmaos.findIndex((produto) => produto.id === id);
      const vizinho = irmaos[posicao + passo];
      if (!vizinho) return atual;

      const copia = [...atual];
      const a = copia.findIndex((produto) => produto.id === alvo.id);
      const b = copia.findIndex((produto) => produto.id === vizinho.id);
      [copia[a], copia[b]] = [copia[b]!, copia[a]!];
      return copia;
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
      </header>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Tela de demonstração. Mover e renomear funciona aqui na tela, mas nada é salvo — ao
          recarregar, volta como estava.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              value={nova}
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
            <Button type="button" onClick={acrescentar} disabled={nova.trim() === ''}>
              <Plus className="size-4" /> Acrescentar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {categorias.map((categoria, indice) => {
          const daCategoria = produtos.filter((produto) => produto.categoriaId === categoria.id);

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
                      aria-label={`Subir a categoria ${categoria.nome}`}
                      onClick={() => moverCategoria(indice, -1)}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      disabled={indice === categorias.length - 1}
                      aria-label={`Descer a categoria ${categoria.nome}`}
                      onClick={() => moverCategoria(indice, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </div>

                  {/* Renomear no lugar, sem tela de edição: a categoria só tem
                      nome, e abrir um formulário para um campo só seria atrito
                      sem contrapartida. */}
                  <Input
                    value={categoria.nome}
                    onChange={(event) => renomear(categoria.id, event.target.value)}
                    aria-label={`Nome da categoria ${categoria.nome}`}
                    className="min-w-40 flex-1 font-semibold"
                  />

                  <Badge variant="secondary">
                    {daCategoria.length} {daCategoria.length === 1 ? 'produto' : 'produtos'}
                  </Badge>

                  {/* Excluir categoria com produto dentro deixaria todos eles
                      sem seção — invisíveis na loja, sem a loja perceber. Por
                      isso o botão só libera quando ela está vazia. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={daCategoria.length > 0}
                    aria-label={`Excluir a categoria ${categoria.nome}`}
                    title={
                      daCategoria.length > 0
                        ? 'Mova os produtos para outra categoria antes de excluir'
                        : undefined
                    }
                    onClick={() => excluir(categoria.id)}
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
                        <span className="flex-1">{produto.nome}</span>
                        {produto.situacao !== 'publicado' && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {produto.situacao === 'rascunho' ? 'Rascunho' : 'Pausado'}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          disabled={posicao === 0}
                          aria-label={`Subir o produto ${produto.nome}`}
                          onClick={() => moverProduto(produto.id, -1)}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          disabled={posicao === daCategoria.length - 1}
                          aria-label={`Descer o produto ${produto.nome}`}
                          onClick={() => moverProduto(produto.id, 1)}
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
              A loja é dividida em seções, e cada seção é uma categoria. Estes produtos não estão em
              nenhuma — <strong>o cliente não tem como chegar neles</strong>, mesmo publicados.
            </p>
            <ul className="space-y-1">
              {semCategoria.map((produto) => (
                <li
                  key={produto.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <span className="flex-1">{produto.nome}</span>
                  <Link
                    href="/loja/produtos"
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled>
          Salvar ordem
        </Button>
        <span className="text-xs text-muted-foreground">
          Desativado enquanto a tela não está ligada ao sistema.
        </span>
      </div>
    </div>
  );
}
