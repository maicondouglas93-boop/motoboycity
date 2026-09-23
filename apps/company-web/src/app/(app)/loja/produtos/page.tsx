'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpDown, ImageOff, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CATEGORIAS_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  faixaDePreco,
  pendenciasDoProduto,
  type ProdutoDeExemplo,
  type SituacaoDoProduto,
} from '@/lib/loja-mock';

const SITUACOES: Record<SituacaoDoProduto, { texto: string; classe: string }> = {
  publicado: { texto: 'No ar', classe: 'bg-emerald-500/10 text-emerald-700' },
  rascunho: { texto: 'Rascunho', classe: 'bg-muted text-muted-foreground' },
  pausado: { texto: 'Pausado', classe: 'bg-amber-500/10 text-amber-700' },
};

type Filtro = 'todos' | SituacaoDoProduto | 'problemas';

/** Resume o que o cliente vai poder escolher, sem abrir o produto. */
function resumoDeOpcoes(produto: ProdutoDeExemplo): string | null {
  const partes: string[] = [];
  if (produto.tamanhos.length > 0) {
    partes.push(`${produto.tamanhos.length} tamanhos`);
  }
  const escolhas = produto.grupos.reduce((soma, grupo) => soma + grupo.escolhas.length, 0);
  if (escolhas > 0) {
    partes.push(`${escolhas} escolhas`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

export default function LojaProdutosPage() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [produtos, setProdutos] = useState(PRODUTOS_DE_EXEMPLO);

  const comPendencias = useMemo(
    () =>
      produtos.map((produto) => {
        const pendencias = pendenciasDoProduto(produto);
        return {
          produto,
          pendencias,
          bloqueiam: pendencias.filter((item) => item.impedeVender),
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
   */
  const quebrados = comPendencias.filter(
    (item) => item.produto.situacao === 'publicado' && item.bloqueiam.length > 0,
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comPendencias.filter(({ produto, bloqueiam }) => {
      const casaBusca = !termo || produto.nome.toLowerCase().includes(termo);
      const casaCategoria = !categoria || produto.categoriaId === categoria;
      const casaFiltro =
        filtro === 'todos'
          ? true
          : filtro === 'problemas'
            ? produto.situacao === 'publicado' && bloqueiam.length > 0
            : produto.situacao === filtro;
      return casaBusca && casaCategoria && casaFiltro;
    });
  }, [busca, categoria, filtro, comPendencias]);

  const contar = (situacao: SituacaoDoProduto) =>
    produtos.filter((produto) => produto.situacao === situacao).length;

  const filtros: Array<{ valor: Filtro; texto: string }> = [
    { valor: 'todos', texto: `Todos (${produtos.length})` },
    { valor: 'publicado', texto: `No ar (${contar('publicado')})` },
    { valor: 'rascunho', texto: `Rascunhos (${contar('rascunho')})` },
    { valor: 'pausado', texto: `Pausados (${contar('pausado')})` },
  ];

  function mudarSituacao(id: string, situacao: SituacaoDoProduto) {
    setProdutos((atual) =>
      atual.map((produto) => (produto.id === id ? { ...produto, situacao } : produto)),
    );
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

      {/* Aviso honesto enquanto não há API: ver AGENTS.md, regra 8. */}
      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Tela de demonstração. Os produtos abaixo são exemplos e nada é salvo — o cadastro ainda
          não está ligado ao sistema.
        </CardContent>
      </Card>

      {/* Produto no ar que o cliente não consegue comprar. A loja não descobre
          isso sozinha: o sintoma é a venda que simplesmente não entra. */}
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
          {CATEGORIAS_DE_EXEMPLO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {lista.map(({ produto, pendencias, bloqueiam }) => {
          const opcoes = resumoDeOpcoes(produto);
          const situacao = SITUACOES[produto.situacao];
          const noArQuebrado = produto.situacao === 'publicado' && bloqueiam.length > 0;
          const nomeDaCategoria =
            CATEGORIAS_DE_EXEMPLO.find((item) => item.id === produto.categoriaId)?.nome ?? null;
          const leves = pendencias.filter((item) => !item.impedeVender);

          return (
            <Card key={produto.id} className={noArQuebrado ? 'border-destructive/40' : undefined}>
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
                    <Badge className={situacao.classe} variant="secondary">
                      {situacao.texto}
                    </Badge>
                    {nomeDaCategoria ? (
                      <Badge variant="outline">{nomeDaCategoria}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sem categoria
                      </Badge>
                    )}
                  </div>
                  {produto.descricao && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {produto.descricao}
                    </p>
                  )}
                  {opcoes && <p className="mt-0.5 text-xs text-muted-foreground">{opcoes}</p>}

                  {/* As que travam a venda aparecem por extenso; as demais,
                      resumidas numa linha só. Dar a "sem foto" o mesmo destaque
                      de "sem preço" faria as duas serem ignoradas juntas. */}
                  {bloqueiam.map((item) => (
                    <p
                      key={item.texto}
                      className="mt-1 flex items-start gap-1.5 text-xs text-destructive"
                    >
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      {item.texto}
                    </p>
                  ))}
                  {leves.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Falta ainda: {leves.map((item) => item.texto).join(', ')}.
                    </p>
                  )}
                </div>

                <p className="font-semibold">{faixaDePreco(produto)}</p>

                <div className="flex items-center gap-1">
                  {produto.situacao === 'publicado' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => mudarSituacao(produto.id, 'pausado')}
                    >
                      Pausar
                    </Button>
                  ) : (
                    /* Publicar com pendência que trava a venda seria pôr no ar
                       um produto que ninguém consegue comprar. */
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bloqueiam.length > 0}
                      title={
                        bloqueiam.length > 0
                          ? 'Resolva o que está em vermelho para poder publicar'
                          : undefined
                      }
                      onClick={() => mudarSituacao(produto.id, 'publicado')}
                    >
                      {produto.situacao === 'rascunho' ? 'Publicar' : 'Voltar a vender'}
                    </Button>
                  )}
                  <Link
                    href={`/loja/produtos/${produto.id}/editar`}
                    aria-label={`Editar ${produto.nome}`}
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
    </div>
  );
}
