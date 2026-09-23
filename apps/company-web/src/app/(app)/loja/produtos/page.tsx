'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ImageOff, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CATEGORIAS_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  faixaDePreco,
  type ProdutoDeExemplo,
} from '@/lib/loja-mock';

/** Resume o que o cliente vai poder escolher, sem abrir o produto. */
function resumoDeOpcoes(produto: ProdutoDeExemplo): string | null {
  const partes: string[] = [];
  if (produto.tamanhos.length > 0) partes.push(`${produto.tamanhos.length} tamanhos`);
  if (produto.adicionais.length > 0) partes.push(`${produto.adicionais.length} adicionais`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

export default function LojaProdutosPage() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return PRODUTOS_DE_EXEMPLO.filter((produto) => {
      const casaBusca = !termo || produto.nome.toLowerCase().includes(termo);
      const casaCategoria = !categoria || produto.categoria === categoria;
      return casaBusca && casaCategoria;
    });
  }, [busca, categoria]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O que sua loja vende. Um produto por item do cardápio — os tamanhos ficam dentro dele.
          </p>
        </div>
        <Link href="/loja/produtos/novo" className={buttonVariants()}>
          <Plus className="size-4" /> Cadastrar produto
        </Link>
      </header>

      {/* Aviso honesto enquanto não há API: ver AGENTS.md, regra 8. */}
      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Tela de demonstração. Os produtos abaixo são exemplos e nada é salvo — o cadastro ainda
          não está ligado ao sistema.
        </CardContent>
      </Card>

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
          {CATEGORIAS_DE_EXEMPLO.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {lista.map((produto) => {
          const opcoes = resumoDeOpcoes(produto);
          return (
            <Card key={produto.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                {/* Miniatura, e não cartão com foto grande: produto sem foto
                    continua íntegro em vez de virar um buraco na lista. */}
                <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {produto.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={produto.imagemUrl}
                      alt=""
                      className="size-14 rounded-lg object-cover"
                    />
                  ) : (
                    <ImageOff className="size-5 text-muted-foreground/60" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{produto.nome}</span>
                    <Badge variant="secondary">{produto.categoria}</Badge>
                    {!produto.ativo && <Badge variant="outline">Inativo</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {produto.descricao}
                  </p>
                  {opcoes && <p className="mt-0.5 text-xs text-muted-foreground">{opcoes}</p>}
                </div>

                <div className="text-right">
                  <p className="font-semibold">{faixaDePreco(produto)}</p>
                </div>

                <Button variant="ghost" size="sm" aria-label={`Editar ${produto.nome}`}>
                  <Pencil className="size-4" />
                </Button>
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
    </div>
  );
}
