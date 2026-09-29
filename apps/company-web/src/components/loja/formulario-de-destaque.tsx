'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import type { DestaqueDaLoja, StoreProduct } from '@motoboycity/types';
import {
  MAXIMO_DE_PRODUTOS_NO_DESTAQUE,
  storeHighlightSchema,
  type StoreHighlightInput,
} from '@motoboycity/validation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SITUACOES,
  faixaDePreco,
  mensagemDoErro,
  mover,
  useCatalogo,
} from '@/components/loja/catalogo';
import { CHAVE_DOS_DESTAQUES } from '@/components/loja/marketing';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Cria ou edita um destaque: um título, os produtos na ordem em que aparecem, e,
 * se quiser, um período.
 *
 * A ordem dos produtos é a do cardápio, e se muda pelos botões subir e descer — o
 * mesmo gesto da tela de Organizar, que funciona no celular sem arrastar. O botão de
 * salvar NÃO fica desabilitado por falta de algo: ao tocar, cada campo mostra o seu
 * erro (o mesmo texto que o servidor usa) e o primeiro recebe o foco.
 */

interface Rascunho {
  titulo: string;
  produtoIds: string[];
  comPeriodo: boolean;
  inicio: string;
  fim: string;
}

function rascunhoDe(destaque?: DestaqueDaLoja): Rascunho {
  return {
    titulo: destaque?.titulo ?? '',
    produtoIds: destaque?.produtoIds ?? [],
    comPeriodo: destaque ? destaque.inicio !== null || destaque.fim !== null : false,
    inicio: destaque?.inicio ?? '',
    fim: destaque?.fim ?? '',
  };
}

function paraOPayload(
  r: Rascunho,
  ativo: boolean,
  existentes: ReadonlySet<string> | null,
): StoreHighlightInput {
  return {
    titulo: r.titulo,
    // O produto apagado depois de entrar no destaque sai sozinho: o que não existe mais não
    // pode ir de volta ao servidor, que o recusaria.
    produtoIds: existentes ? r.produtoIds.filter((id) => existentes.has(id)) : r.produtoIds,
    inicio: r.comPeriodo && r.inicio ? r.inicio : null,
    fim: r.comPeriodo && r.fim ? r.fim : null,
    ativo,
  };
}

function Erro({ texto }: { texto: string | undefined }) {
  if (!texto) return null;
  return (
    <p className="mt-1 text-xs text-destructive-text" role="alert">
      {texto}
    </p>
  );
}

export function FormularioDeDestaque({ destaque }: { destaque?: DestaqueDaLoja }) {
  const token = session.getToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const catalogo = useCatalogo();
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(destaque));
  const [busca, setBusca] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);

  const produtos = useMemo(() => catalogo.data?.products ?? [], [catalogo.data]);
  const porId = useMemo(
    () => new Map(produtos.map((produto) => [produto.id, produto])),
    [produtos],
  );
  // Só depois de o catálogo chegar dá para dizer que um produto sumiu.
  const existentes = useMemo(
    () => (catalogo.data ? new Set(produtos.map((produto) => produto.id)) : null),
    [catalogo.data, produtos],
  );

  /** Os escolhidos que ainda existem, na ordem do destaque. */
  const escolhidos = useMemo(
    () =>
      r.produtoIds.flatMap((id) => {
        const produto = porId.get(id);
        return produto ? [produto] : [];
      }),
    [r.produtoIds, porId],
  );
  const idsEscolhidos = useMemo(() => new Set(r.produtoIds), [r.produtoIds]);
  const cheio = escolhidos.length >= MAXIMO_DE_PRODUTOS_NO_DESTAQUE;

  const disponiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter(
      (produto) =>
        !idsEscolhidos.has(produto.id) && (!termo || produto.name.toLowerCase().includes(termo)),
    );
  }, [produtos, idsEscolhidos, busca]);

  const salvar = useMutation({
    mutationFn: (payload: StoreHighlightInput) =>
      destaque
        ? companyStoreMarketingApi.updateHighlight(token as string, destaque.id, payload)
        : companyStoreMarketingApi.createHighlight(token as string, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_DESTAQUES });
      router.push('/loja/marketing/destaques');
    },
    onError: (falha) =>
      setErroDoServidor(mensagemDoErro(falha, 'Não foi possível salvar o destaque.')),
  });

  function mudar(mudancas: Partial<Rascunho>) {
    setR((atual) => ({ ...atual, ...mudancas }));
    setErros({});
    setErroDoServidor(null);
  }

  function moverProduto(id: string, passo: number) {
    // A ordem se muda entre os que existem: o id de um produto apagado não atrapalha.
    const ids = escolhidos.map((produto) => produto.id);
    const de = ids.indexOf(id);
    mudar({ produtoIds: mover(ids, de, de + passo) });
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroDoServidor(null);
    const payload = paraOPayload(r, destaque?.ativo ?? true, existentes);
    const resultado = storeHighlightSchema.safeParse(payload);
    if (!resultado.success) {
      const achados: Record<string, string> = {};
      for (const problema of resultado.error.issues) {
        const campo = String(problema.path[0] ?? 'titulo');
        achados[campo] ??= problema.message;
      }
      setErros(achados);
      const primeiro = Object.keys(achados)[0];
      // O foco vai para o primeiro campo com erro: quem está no celular não vê o resto.
      queueMicrotask(() => document.getElementById(`campo-${primeiro}`)?.focus());
      return;
    }
    setErros({});
    salvar.mutate(payload);
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Qual é o destaque?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campo-titulo" className="mb-2">
              Título
            </Label>
            <Input
              id="campo-titulo"
              value={r.titulo}
              maxLength={40}
              placeholder="Ex.: Mais pedidos"
              aria-invalid={Boolean(erros['titulo'])}
              onChange={(evento) => mudar({ titulo: evento.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              É o que o cliente lê no alto do cardápio: &ldquo;Mais pedidos&rdquo;,
              &ldquo;Novidades&rdquo;, &ldquo;Almoço de hoje&rdquo;.
            </p>
            <Erro texto={erros['titulo']} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id="campo-produtoIds" tabIndex={-1} className="space-y-2 outline-none">
            <p className="text-sm font-medium">
              No destaque{' '}
              <span className="font-normal text-muted-foreground">
                ({escolhidos.length} de {MAXIMO_DE_PRODUTOS_NO_DESTAQUE})
              </span>
            </p>
            {escolhidos.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Nenhum produto ainda. Escolha abaixo os que vão aparecer, na ordem em que você quer.
              </p>
            ) : (
              <ol className="divide-y rounded-md border">
                {escolhidos.map((produto: StoreProduct, indice) => {
                  const situacao = SITUACOES[produto.status];
                  return (
                    <li key={produto.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-5 text-sm text-muted-foreground tabular-nums">
                        {indice + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{produto.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {faixaDePreco(produto)}
                          {produto.status !== 'PUBLISHED' && (
                            <span className="ml-2 text-amber-700 dark:text-amber-400">
                              {situacao.texto}: não aparece enquanto não estiver à venda
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Subir ${produto.name}`}
                        disabled={indice === 0}
                        onClick={() => moverProduto(produto.id, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Descer ${produto.name}`}
                        disabled={indice === escolhidos.length - 1}
                        onClick={() => moverProduto(produto.id, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Tirar ${produto.name} do destaque`}
                        onClick={() =>
                          mudar({ produtoIds: r.produtoIds.filter((id) => id !== produto.id) })
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
            <Erro texto={erros['produtoIds']} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Adicionar produto</p>
            {cheio ? (
              <p className="text-sm text-muted-foreground">
                O destaque está cheio: tire um produto para pôr outro.
              </p>
            ) : (
              <>
                {produtos.length > 6 && (
                  <div className="relative">
                    <Search
                      className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={busca}
                      onChange={(evento) => setBusca(evento.target.value)}
                      placeholder="Buscar produto..."
                      aria-label="Buscar produto para adicionar"
                      className="pl-9"
                    />
                  </div>
                )}
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {catalogo.isLoading && (
                    <p className="px-1 py-2 text-sm text-muted-foreground">Carregando produtos…</p>
                  )}
                  {catalogo.isSuccess && disponiveis.length === 0 && (
                    <p className="px-1 py-2 text-sm text-muted-foreground">
                      {produtos.length === 0
                        ? 'Você ainda não cadastrou produtos.'
                        : 'Nenhum outro produto por aqui.'}
                    </p>
                  )}
                  {disponiveis.map((produto) => (
                    <div key={produto.id} className="flex items-center gap-2 rounded px-1 py-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{produto.name}</p>
                        <p className="text-xs text-muted-foreground">{faixaDePreco(produto)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Adicionar ${produto.name}`}
                        onClick={() => mudar({ produtoIds: [...r.produtoIds, produto.id] })}
                      >
                        <Plus className="size-4" /> Adicionar
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Só aparece no cardápio o produto publicado e à venda; o destaque sem nenhum produto à
              venda some sozinho.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quando aparece</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sem nada marcado, aparece o tempo todo, enquanto estiver ligado.
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comPeriodo}
              onCheckedChange={(valor) => mudar({ comPeriodo: valor === true })}
            />
            <span>Só num período</span>
          </label>
          {r.comPeriodo && (
            <div className="flex flex-wrap gap-4 pl-6">
              <div>
                <Label htmlFor="campo-inicio" className="mb-2">
                  De
                </Label>
                <Input
                  id="campo-inicio"
                  type="date"
                  value={r.inicio}
                  aria-invalid={Boolean(erros['inicio'])}
                  onChange={(evento) => mudar({ inicio: evento.target.value })}
                />
                <Erro texto={erros['inicio']} />
              </div>
              <div>
                <Label htmlFor="campo-fim" className="mb-2">
                  Até
                </Label>
                <Input
                  id="campo-fim"
                  type="date"
                  value={r.fim}
                  aria-invalid={Boolean(erros['fim'])}
                  onChange={(evento) => mudar({ fim: evento.target.value })}
                />
                <Erro texto={erros['fim']} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {erroDoServidor && (
        <p className="text-sm text-destructive" role="alert">
          {erroDoServidor}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending} aria-busy={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : destaque ? 'Salvar alterações' : 'Criar destaque'}
        </Button>
        <Link href="/loja/marketing/destaques" className={buttonVariants({ variant: 'ghost' })}>
          Cancelar
        </Link>
      </div>
      {!destaque && (
        <p className="text-xs text-muted-foreground">
          O destaque nasce ligado, no fim da fila. Dá para mudar a ordem na lista.
        </p>
      )}
    </form>
  );
}
