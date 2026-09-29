'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CupomDaLoja, TipoDeCupom } from '@motoboycity/types';
import {
  normalizarCodigoDoCupom,
  storeCouponSchema,
  type StoreCouponInput,
} from '@motoboycity/validation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensagemDoErro, useCatalogo } from '@/components/loja/catalogo';
import { CHAVE_DOS_CUPONS, descricaoDoCupom, regrasDoCupom } from '@/components/loja/marketing';
import { precoParaTexto, textoParaPreco } from '@/components/loja/produto-no-formulario';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Cria ou edita um cupom. Poucos campos, e as regras extras só aparecem quando se
 * pede: quem configura é um lojista pequeno, muitas vezes pelo celular.
 *
 * O botão de salvar NÃO fica desabilitado por falta de algo — desabilitado, ele
 * não diz o que falta. Ao tocar, cada campo mostra o seu erro (o mesmo texto que o
 * servidor usa, do `storeCouponSchema`) e o primeiro recebe o foco.
 */

interface Rascunho {
  codigo: string;
  tipo: TipoDeCupom;
  percentual: string;
  valor: string;
  comMinimo: boolean;
  minimo: string;
  comTeto: boolean;
  teto: string;
  comPeriodo: boolean;
  inicio: string;
  fim: string;
  comLimite: boolean;
  limite: string;
  comLimiteDoCliente: boolean;
  limiteDoCliente: string;
  soAlguns: boolean;
  produtoIds: string[];
  categoriaIds: string[];
  valeEmPromocao: boolean;
  mostrarNoCheckout: boolean;
}

function rascunhoDe(cupom?: CupomDaLoja): Rascunho {
  return {
    codigo: cupom?.codigo ?? '',
    tipo: cupom?.tipo ?? 'PERCENTUAL',
    percentual: cupom?.percentual != null ? String(cupom.percentual) : '',
    valor: precoParaTexto(cupom?.valor ?? null),
    comMinimo: cupom ? cupom.pedidoMinimo !== null : false,
    minimo: precoParaTexto(cupom?.pedidoMinimo ?? null),
    comTeto: cupom ? cupom.descontoMaximo !== null : false,
    teto: precoParaTexto(cupom?.descontoMaximo ?? null),
    comPeriodo: cupom ? cupom.inicio !== null || cupom.fim !== null : false,
    inicio: cupom?.inicio ?? '',
    fim: cupom?.fim ?? '',
    comLimite: cupom ? cupom.limiteDeUsos !== null : false,
    limite: cupom?.limiteDeUsos != null ? String(cupom.limiteDeUsos) : '',
    comLimiteDoCliente: cupom ? cupom.limitePorCliente !== null : false,
    limiteDoCliente: cupom?.limitePorCliente != null ? String(cupom.limitePorCliente) : '',
    soAlguns: cupom ? cupom.produtoIds.length + cupom.categoriaIds.length > 0 : false,
    produtoIds: cupom?.produtoIds ?? [],
    categoriaIds: cupom?.categoriaIds ?? [],
    valeEmPromocao: cupom?.valeEmPromocao ?? false,
    // Cupom novo nasce aparecendo: é o que a maioria das lojas quer, e é fácil de desmarcar.
    mostrarNoCheckout: cupom?.mostrarNoCheckout ?? true,
  };
}

/** Número inteiro escrito na tela; vazio ou inválido vira `null`. */
function numero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/** Dinheiro escrito na tela ("1.234,50"); vazio ou inválido vira `null`. */
function dinheiro(texto: string): number | null {
  const valor = textoParaPreco(texto);
  return valor === null || Number.isNaN(valor) ? null : valor;
}

function paraOPayload(r: Rascunho, ativo: boolean): StoreCouponInput {
  return {
    codigo: r.codigo,
    tipo: r.tipo,
    percentual: numero(r.percentual),
    valor: dinheiro(r.valor),
    pedidoMinimo: r.comMinimo ? dinheiro(r.minimo) : null,
    descontoMaximo: r.tipo === 'PERCENTUAL' && r.comTeto ? dinheiro(r.teto) : null,
    inicio: r.comPeriodo && r.inicio ? r.inicio : null,
    fim: r.comPeriodo && r.fim ? r.fim : null,
    limiteDeUsos: r.comLimite ? numero(r.limite) : null,
    limitePorCliente: r.comLimiteDoCliente ? numero(r.limiteDoCliente) : null,
    produtoIds: r.soAlguns ? r.produtoIds : [],
    categoriaIds: r.soAlguns ? r.categoriaIds : [],
    valeEmPromocao: r.valeEmPromocao,
    mostrarNoCheckout: r.mostrarNoCheckout,
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

/** Uma lista de caixas de marcar dentro de uma caixa que rola: o cardápio pode ter dezenas de itens. */
function ListaDeEscolha({
  titulo,
  itens,
  marcados,
  aoMudar,
}: {
  titulo: string;
  itens: Array<{ id: string; nome: string }>;
  marcados: string[];
  aoMudar: (ids: string[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const visiveis = itens.filter((item) =>
    item.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {titulo}
        {marcados.length > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {marcados.length} {marcados.length === 1 ? 'escolhido' : 'escolhidos'}
          </span>
        )}
      </legend>
      {itens.length > 6 && (
        <Input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder={`Buscar em ${titulo.toLowerCase()}...`}
          aria-label={`Buscar em ${titulo.toLowerCase()}`}
        />
      )}
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
        {visiveis.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted-foreground">Nada por aqui.</p>
        )}
        {visiveis.map((item) => (
          <label key={item.id} className="flex items-center gap-2.5 rounded px-1 py-1.5 text-sm">
            <Checkbox
              checked={marcados.includes(item.id)}
              onCheckedChange={(valor) =>
                aoMudar(
                  valor === true
                    ? [...marcados, item.id]
                    : marcados.filter((marcado) => marcado !== item.id),
                )
              }
            />
            {item.nome}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FormularioDeCupom({ cupom }: { cupom?: CupomDaLoja }) {
  const token = session.getToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const catalogo = useCatalogo();
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(cupom));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);

  const produtos = useMemo(
    () =>
      (catalogo.data?.products ?? []).map((produto) => ({ id: produto.id, nome: produto.name })),
    [catalogo.data],
  );
  const secoes = useMemo(
    () => (catalogo.data?.categories ?? []).map((secao) => ({ id: secao.id, nome: secao.name })),
    [catalogo.data],
  );

  const salvar = useMutation({
    mutationFn: (payload: StoreCouponInput) =>
      cupom
        ? companyStoreMarketingApi.updateCoupon(token as string, cupom.id, payload)
        : companyStoreMarketingApi.createCoupon(token as string, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_CUPONS });
      router.push('/loja/marketing/cupons');
    },
    onError: (falha) => {
      const mensagem = mensagemDoErro(falha, 'Não foi possível salvar o cupom.');
      setErroDoServidor(mensagem);
    },
  });

  function mudar(mudancas: Partial<Rascunho>) {
    setR((atual) => ({ ...atual, ...mudancas }));
    setErros({});
    setErroDoServidor(null);
  }

  const conferido = storeCouponSchema.safeParse(paraOPayload(r, true));

  /** O que o cliente lê, em uma frase, antes de salvar. */
  const resumo = useMemo(() => {
    if (!conferido.success) return null;
    const dados = conferido.data;
    const regras = regrasDoCupom(dados);
    return `${dados.codigo}: ${descricaoDoCupom(dados)} — ${regras.join(', ')}.`;
  }, [conferido]);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroDoServidor(null);
    const payload = paraOPayload(r, cupom?.ativo ?? true);
    const resultado = storeCouponSchema.safeParse(payload);
    if (!resultado.success) {
      const achados: Record<string, string> = {};
      for (const problema of resultado.error.issues) {
        const campo = String(problema.path[0] ?? 'codigo');
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
          <CardTitle>Qual é o cupom?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campo-codigo" className="mb-2">
              Código
            </Label>
            <Input
              id="campo-codigo"
              value={r.codigo}
              maxLength={24}
              autoCapitalize="characters"
              placeholder="Ex.: BEMVINDO10"
              aria-invalid={Boolean(erros['codigo'])}
              onChange={(evento) => mudar({ codigo: normalizarCodigoDoCupom(evento.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              É o que o cliente digita no checkout. Letras, números, hífen ou sublinhado, de 3 a 20.
            </p>
            <Erro texto={erros['codigo']} />
          </div>

          <div
            role="radiogroup"
            aria-label="Tipo de desconto"
            className="grid gap-2 sm:grid-cols-2"
          >
            {(
              [
                {
                  valor: 'PERCENTUAL',
                  nome: 'Percentual (%)',
                  dica: 'Ex.: 10% de desconto nos itens.',
                },
                { valor: 'VALOR', nome: 'Valor fixo (R$)', dica: 'Ex.: R$ 5,00 de desconto.' },
              ] as const
            ).map(({ valor, nome, dica }) => (
              <label
                key={valor}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
                  r.tipo === valor ? 'border-primary bg-accent' : ''
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  className="mt-0.5 size-4"
                  checked={r.tipo === valor}
                  onChange={() => mudar({ tipo: valor })}
                />
                <span>
                  <span className="font-medium">{nome}</span>
                  <span className="block text-xs text-muted-foreground">{dica}</span>
                </span>
              </label>
            ))}
          </div>

          {r.tipo === 'PERCENTUAL' ? (
            <div className="max-w-40">
              <Label htmlFor="campo-percentual" className="mb-2">
                Desconto (%)
              </Label>
              <Input
                id="campo-percentual"
                inputMode="numeric"
                value={r.percentual}
                placeholder="10"
                aria-invalid={Boolean(erros['percentual'])}
                onChange={(evento) => mudar({ percentual: evento.target.value })}
              />
              <Erro texto={erros['percentual']} />
            </div>
          ) : (
            <div className="max-w-48">
              <Label htmlFor="campo-valor" className="mb-2">
                Desconto (R$)
              </Label>
              <Input
                id="campo-valor"
                inputMode="decimal"
                value={r.valor}
                placeholder="5,00"
                aria-invalid={Boolean(erros['valor'])}
                onChange={(evento) => mudar({ valor: evento.target.value })}
              />
              <Erro texto={erros['valor']} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onde vale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="sr-only">Itens do cupom</legend>
            <div className="flex flex-wrap gap-4">
              {[
                { valor: false, texto: 'Em todos os itens' },
                { valor: true, texto: 'Só em alguns produtos ou seções' },
              ].map(({ valor, texto }) => (
                <label key={texto} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="alcance"
                    className="size-4"
                    checked={r.soAlguns === valor}
                    onChange={() => mudar({ soAlguns: valor })}
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
          {r.soAlguns && (
            <div className="space-y-4">
              <ListaDeEscolha
                titulo="Seções"
                itens={secoes}
                marcados={r.categoriaIds}
                aoMudar={(ids) => mudar({ categoriaIds: ids })}
              />
              <ListaDeEscolha
                titulo="Produtos"
                itens={produtos}
                marcados={r.produtoIds}
                aoMudar={(ids) => mudar({ produtoIds: ids })}
              />
              <p className="text-xs text-muted-foreground">
                O cupom vale nos produtos marcados e em todos os produtos das seções marcadas.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.valeEmPromocao}
              onCheckedChange={(valor) => mudar({ valeEmPromocao: valor === true })}
            />
            <span>
              Vale também em itens que já estão em promoção
              <span className="block text-xs text-muted-foreground">
                Desligado, o cupom não se soma à promoção: o item em promoção fica de fora e o
                desconto é só dos itens a preço cheio.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.mostrarNoCheckout}
              onCheckedChange={(valor) => mudar({ mostrarNoCheckout: valor === true })}
            />
            <span>
              Mostrar este cupom no checkout
              <span className="block text-xs text-muted-foreground">
                O cliente vê o cupom na lista &ldquo;Cupons&rdquo; e aplica com um toque, sem
                digitar. Desmarcado, o cupom é secreto: só usa quem tem o código.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras e limites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sem nada marcado, vale para qualquer pedido, o tempo todo, enquanto estiver ligado.
          </p>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comMinimo}
              onCheckedChange={(valor) => mudar({ comMinimo: valor === true })}
            />
            <span>Pedido mínimo</span>
          </label>
          {r.comMinimo && (
            <div className="max-w-48 pl-6">
              <Label htmlFor="campo-pedidoMinimo" className="mb-2">
                A partir de (R$)
              </Label>
              <Input
                id="campo-pedidoMinimo"
                inputMode="decimal"
                value={r.minimo}
                placeholder="30,00"
                aria-invalid={Boolean(erros['pedidoMinimo'])}
                onChange={(evento) => mudar({ minimo: evento.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Conta os itens do pedido inteiro, já com as promoções, sem a entrega.
              </p>
              <Erro texto={erros['pedidoMinimo']} />
            </div>
          )}

          {r.tipo === 'PERCENTUAL' && (
            <>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={r.comTeto}
                  onCheckedChange={(valor) => mudar({ comTeto: valor === true })}
                />
                <span>Limitar o valor do desconto</span>
              </label>
              {r.comTeto && (
                <div className="max-w-48 pl-6">
                  <Label htmlFor="campo-descontoMaximo" className="mb-2">
                    Desconto máximo (R$)
                  </Label>
                  <Input
                    id="campo-descontoMaximo"
                    inputMode="decimal"
                    value={r.teto}
                    placeholder="15,00"
                    aria-invalid={Boolean(erros['descontoMaximo'])}
                    onChange={(evento) => mudar({ teto: evento.target.value })}
                  />
                  <Erro texto={erros['descontoMaximo']} />
                </div>
              )}
            </>
          )}

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

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comLimite}
              onCheckedChange={(valor) => mudar({ comLimite: valor === true })}
            />
            <span>
              Limitar quantos pedidos podem usar
              <span className="block text-xs text-muted-foreground">
                Conta um uso por pedido. Se o pedido for cancelado, o uso volta.
              </span>
            </span>
          </label>
          {r.comLimite && (
            <div className="max-w-40 pl-6">
              <Label htmlFor="campo-limiteDeUsos" className="mb-2">
                Quantos pedidos
              </Label>
              <Input
                id="campo-limiteDeUsos"
                inputMode="numeric"
                value={r.limite}
                placeholder="100"
                aria-invalid={Boolean(erros['limiteDeUsos'])}
                onChange={(evento) => mudar({ limite: evento.target.value })}
              />
              <Erro texto={erros['limiteDeUsos']} />
            </div>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comLimiteDoCliente}
              onCheckedChange={(valor) => mudar({ comLimiteDoCliente: valor === true })}
            />
            <span>
              Limitar por cliente
              <span className="block text-xs text-muted-foreground">
                Cada cliente (pela conta Google dele) usa no máximo essa quantidade de vezes.
              </span>
            </span>
          </label>
          {r.comLimiteDoCliente && (
            <div className="max-w-40 pl-6">
              <Label htmlFor="campo-limitePorCliente" className="mb-2">
                Vezes por cliente
              </Label>
              <Input
                id="campo-limitePorCliente"
                inputMode="numeric"
                value={r.limiteDoCliente}
                placeholder="1"
                aria-invalid={Boolean(erros['limitePorCliente'])}
                onChange={(evento) => mudar({ limiteDoCliente: evento.target.value })}
              />
              <Erro texto={erros['limitePorCliente']} />
            </div>
          )}
        </CardContent>
      </Card>

      {resumo && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
          <p className="text-xs font-medium text-muted-foreground">Como fica</p>
          <p className="mt-1">{resumo}</p>
        </div>
      )}

      {erroDoServidor && (
        <p className="text-sm text-destructive" role="alert">
          {erroDoServidor}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={salvar.isPending} aria-busy={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : cupom ? 'Salvar alterações' : 'Criar cupom'}
        </Button>
        <Link href="/loja/marketing/cupons" className={buttonVariants({ variant: 'ghost' })}>
          Cancelar
        </Link>
      </div>
      {!cupom && (
        <p className="text-xs text-muted-foreground">
          O cupom nasce ligado. Passe o código aos clientes; dá para desligar quando quiser.
        </p>
      )}
    </form>
  );
}
