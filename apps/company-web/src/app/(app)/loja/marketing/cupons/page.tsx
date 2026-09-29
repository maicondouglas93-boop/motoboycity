'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, CopyPlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { mensagemDoErro } from '@/components/loja/catalogo';
import {
  CHAVE_DOS_CUPONS,
  descricaoDoCupom,
  regrasDoCupom,
  situacaoDoCupom,
  useCupons,
  type CodigoDaSituacao,
} from '@/components/loja/marketing';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

type Filtro = 'todos' | CodigoDaSituacao;

const FILTROS: Array<{ valor: Filtro; texto: string }> = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'NO_AR', texto: 'No ar' },
  { valor: 'AGENDADA', texto: 'Agendados' },
  { valor: 'DESLIGADA', texto: 'Desligados' },
  { valor: 'ENCERRADA', texto: 'Encerrados' },
  { valor: 'ESGOTADA', texto: 'Esgotados' },
];

export default function CuponsPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const cupons = useCupons();
  const instante = useAgora();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [erro, setErro] = useState<string | null>(null);
  // O código que acabou de ser copiado, para o botão dizer "Copiado".
  const [copiado, setCopiado] = useState<string | null>(null);
  // A exclusão pede um segundo toque: apagar um cupom não tem volta.
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_DOS_CUPONS });

  const ligar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; codigo: string; ativo: boolean }) =>
      companyStoreMarketingApi.setCouponActive(token as string, id, ativo),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { codigo }) => {
      setErro(`${codigo}: ${mensagemDoErro(falha, 'não foi possível mudar o cupom.')}`);
      void atualizar();
    },
  });

  const duplicar = useMutation({
    mutationFn: ({ id }: { id: string; codigo: string }) =>
      companyStoreMarketingApi.duplicateCoupon(token as string, id),
    onSuccess: () => {
      setErro(null);
      void atualizar();
    },
    onError: (falha, { codigo }) =>
      setErro(`${codigo}: ${mensagemDoErro(falha, 'não foi possível duplicar.')}`),
  });

  const excluir = useMutation({
    mutationFn: ({ id }: { id: string; codigo: string }) =>
      companyStoreMarketingApi.deleteCoupon(token as string, id),
    onSuccess: () => {
      setErro(null);
      setConfirmando(null);
      void atualizar();
    },
    onError: (falha, { codigo }) => {
      setConfirmando(null);
      setErro(`${codigo}: ${mensagemDoErro(falha, 'não foi possível excluir.')}`);
      void atualizar();
    },
  });

  const lista = useMemo(() => cupons.data ?? [], [cupons.data]);
  const agora = useMemo(() => new Date(instante), [instante]);
  const comSituacao = useMemo(
    () => lista.map((cupom) => ({ cupom, situacao: situacaoDoCupom(cupom, agora) })),
    [lista, agora],
  );
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comSituacao.filter(
      ({ cupom, situacao }) =>
        (!termo || cupom.codigo.toLowerCase().includes(termo)) &&
        (filtro === 'todos' || situacao.codigo === filtro),
    );
  }, [comSituacao, busca, filtro]);

  if (!token) return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;

  const contar = (valor: Filtro) =>
    valor === 'todos'
      ? comSituacao.length
      : comSituacao.filter(({ situacao }) => situacao.codigo === valor).length;

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(codigo);
      window.setTimeout(() => setCopiado((atual) => (atual === codigo ? null : atual)), 2000);
    } catch {
      setErro('Não deu para copiar. Selecione o código e copie à mão.');
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Cupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O cliente digita o código no checkout. O cupom não se soma à promoção: por padrão, só
            desconta os itens a preço cheio.
          </p>
        </div>
        <Link href="/loja/marketing/cupons/nova" className={buttonVariants()}>
          <Plus className="size-4" /> Novo cupom
        </Link>
      </header>

      {erro && (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      )}

      {cupons.isLoading && (
        <div className="space-y-px overflow-hidden rounded-lg border" role="status">
          <span className="sr-only">Carregando cupons...</span>
          <Skeleton className="h-20 rounded-none" />
          <Skeleton className="h-20 rounded-none" />
          <Skeleton className="h-20 rounded-none" />
        </div>
      )}

      {cupons.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar os cupons.</p>
            <Button type="button" variant="outline" onClick={() => void cupons.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {cupons.isSuccess && lista.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Nenhum cupom ainda.</p>
            <p>
              Crie o primeiro — por exemplo BEMVINDO10, com 10% de desconto — e passe o código aos
              seus clientes.
            </p>
            <Link href="/loja/marketing/cupons/nova" className={buttonVariants()}>
              <Plus className="size-4" /> Criar cupom
            </Link>
          </CardContent>
        </Card>
      )}

      {cupons.isSuccess && lista.length > 0 && (
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
              placeholder="Buscar cupom..."
              aria-label="Buscar cupom"
              className="pl-9"
            />
          </div>

          <Card className="gap-0 divide-y py-0">
            {visiveis.map(({ cupom, situacao }) => {
              const ocupado =
                (ligar.isPending && ligar.variables?.id === cupom.id) ||
                (duplicar.isPending && duplicar.variables?.id === cupom.id) ||
                (excluir.isPending && excluir.variables?.id === cupom.id);
              return (
                <div key={cupom.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-56 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tracking-wide">{cupom.codigo}</span>
                      <Badge className={situacao.classe} variant="secondary">
                        {situacao.texto}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm">{descricaoDoCupom(cupom)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {regrasDoCupom(cupom).join(' · ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupado}
                      onClick={() =>
                        ligar.mutate({ id: cupom.id, codigo: cupom.codigo, ativo: !cupom.ativo })
                      }
                    >
                      {cupom.ativo ? 'Desligar' : 'Ligar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Copiar o código ${cupom.codigo}`}
                      title="Copiar o código"
                      onClick={() => void copiar(cupom.codigo)}
                    >
                      <ClipboardCopy className="size-4" />
                      {copiado === cupom.codigo && <span className="text-xs">Copiado</span>}
                    </Button>
                    <Link
                      href={`/loja/marketing/cupons/${cupom.id}/editar`}
                      aria-label={`Editar ${cupom.codigo}`}
                      title="Editar"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      aria-label={`Duplicar ${cupom.codigo}`}
                      title="Duplicar"
                      onClick={() => duplicar.mutate({ id: cupom.id, codigo: cupom.codigo })}
                    >
                      <CopyPlus className="size-4" />
                    </Button>
                    {confirmando === cupom.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={ocupado}
                          onClick={() => excluir.mutate({ id: cupom.id, codigo: cupom.codigo })}
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
                        aria-label={`Excluir ${cupom.codigo}`}
                        title="Excluir"
                        onClick={() => setConfirmando(cupom.id)}
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
                <p className="text-sm font-medium">Nenhum cupom encontrado.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mude o filtro ou a busca para ver os outros.
                </p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
