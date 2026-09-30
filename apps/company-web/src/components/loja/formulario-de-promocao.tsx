'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PromocaoDaLoja, PromocaoPublica, TipoDePromocao } from '@motoboycity/types';
import { storePromotionSchema, type StorePromotionInput } from '@motoboycity/validation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensagemDoErro, useCatalogo } from '@/components/loja/catalogo';
import { CHAVE_DAS_PROMOCOES, NOMES_DOS_TIPOS } from '@/components/loja/marketing';
import { precoParaTexto, textoParaPreco } from '@/components/loja/produto-no-formulario';
import { companyStoreMarketingApi } from '@/lib/api-client';
import { ofertaNaVitrine } from '@/lib/loja-promocoes';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

/**
 * Cria ou edita uma promoção. Poucos campos, e só os que o tipo escolhido pede:
 * quem configura é um lojista pequeno, muitas vezes pelo celular, e cada campo
 * a mais é uma promoção errada que ele só descobre no caixa.
 *
 * O botão de salvar NÃO fica desabilitado por falta de algo — desabilitado, ele
 * não diz o que falta. Ao tocar, cada campo mostra o seu erro (o mesmo texto
 * que o servidor usa, do `storePromotionSchema`) e o primeiro recebe o foco.
 */

interface Rascunho {
  nome: string;
  alvo: 'PRODUTO' | 'CATEGORIA';
  produtoId: string;
  categoriaId: string;
  tipo: TipoDePromocao;
  percentual: string;
  preco: string;
  leve: string;
  pague: string;
  comPeriodo: boolean;
  inicio: string;
  fim: string;
  comHorario: boolean;
  horaInicio: string;
  horaFim: string;
  dias: number[];
  comLimite: boolean;
  limite: string;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TIPOS: Array<{ valor: TipoDePromocao; explicacao: string }> = [
  { valor: 'PERCENTUAL', explicacao: 'Ex.: 20% OFF no açaí.' },
  { valor: 'PRECO', explicacao: 'O produto passa a custar um valor fixo.' },
  { valor: 'LEVE_PAGUE', explicacao: 'Ex.: leve 3, pague 2.' },
  { valor: 'SEGUNDO_COM_DESCONTO', explicacao: 'Ex.: o segundo item com 50% OFF.' },
];

function rascunhoDe(promocao?: PromocaoDaLoja): Rascunho {
  return {
    nome: promocao?.nome ?? '',
    alvo: promocao?.alvo ?? 'PRODUTO',
    produtoId: promocao?.produtoId ?? '',
    categoriaId: promocao?.categoriaId ?? '',
    tipo: promocao?.tipo ?? 'PERCENTUAL',
    percentual: promocao?.percentual != null ? String(promocao.percentual) : '',
    preco: precoParaTexto(promocao?.precoPromocional ?? null),
    leve: promocao?.leve != null ? String(promocao.leve) : '',
    pague: promocao?.pague != null ? String(promocao.pague) : '',
    comPeriodo: promocao ? promocao.inicio !== null || promocao.fim !== null : false,
    inicio: promocao?.inicio ?? '',
    fim: promocao?.fim ?? '',
    comHorario: promocao ? promocao.horaInicio !== null || promocao.diasDaSemana.length > 0 : false,
    horaInicio: promocao?.horaInicio ?? '',
    horaFim: promocao?.horaFim ?? '',
    dias: promocao?.diasDaSemana ?? [],
    comLimite: promocao ? promocao.limiteDeUsos !== null : false,
    limite: promocao?.limiteDeUsos != null ? String(promocao.limiteDeUsos) : '',
  };
}

/** Número inteiro ou decimal escrito na tela; vazio ou inválido vira `null`. */
function numero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

function paraOPayload(r: Rascunho, ativa: boolean): StorePromotionInput {
  const preco = textoParaPreco(r.preco);
  return {
    nome: r.nome,
    tipo: r.tipo,
    alvo: r.alvo,
    produtoId: r.alvo === 'PRODUTO' ? r.produtoId || null : null,
    categoriaId: r.alvo === 'CATEGORIA' ? r.categoriaId || null : null,
    percentual: numero(r.percentual),
    precoPromocional: preco === null || Number.isNaN(preco) ? null : preco,
    leve: numero(r.leve),
    pague: numero(r.pague),
    inicio: r.comPeriodo && r.inicio ? r.inicio : null,
    fim: r.comPeriodo && r.fim ? r.fim : null,
    horaInicio: r.comHorario && r.horaInicio ? r.horaInicio : null,
    horaFim: r.comHorario && r.horaFim ? r.horaFim : null,
    diasDaSemana: r.comHorario ? [...r.dias].sort((a, b) => a - b) : [],
    limiteDeUsos: r.comLimite ? numero(r.limite) : null,
    ativa,
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

const SELECT =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-destructive pointer-coarse:h-11';

export function FormularioDePromocao({ promocao }: { promocao?: PromocaoDaLoja }) {
  const token = session.getToken();
  const router = useRouter();
  const queryClient = useQueryClient();
  const catalogo = useCatalogo();
  const instante = useAgora();
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(promocao));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);

  const produtos = useMemo(() => catalogo.data?.products ?? [], [catalogo.data]);
  const secoes = useMemo(() => catalogo.data?.categories ?? [], [catalogo.data]);

  const salvar = useMutation({
    mutationFn: (payload: StorePromotionInput) =>
      promocao
        ? companyStoreMarketingApi.updatePromotion(token as string, promocao.id, payload)
        : companyStoreMarketingApi.createPromotion(token as string, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_PROMOCOES });
      router.push('/loja/marketing/promocoes');
    },
    onError: (falha) =>
      setErroDoServidor(mensagemDoErro(falha, 'Não foi possível salvar a promoção.')),
  });

  function mudar(mudancas: Partial<Rascunho>) {
    setR((atual) => ({ ...atual, ...mudancas }));
    setErros({});
    setErroDoServidor(null);
  }

  // O preço promocional só vale para produto de preço único: com tamanhos, cada
  // um tem o seu preço, e o desconto em % é o que faz sentido.
  // O combo já tem preço especial e não entra em promoção: nem na lista, nem na conta da seção.
  const soProdutos = produtos.filter((p) => p.kind !== 'COMBO');
  const produtosDoTipo =
    r.tipo === 'PRECO' ? soProdutos.filter((p) => p.price !== null) : soProdutos;
  const produtoEscolhido = produtos.find((p) => p.id === r.produtoId) ?? null;

  const conferido = storePromotionSchema.safeParse(paraOPayload(r, true));

  /** O que o cliente veria, pela mesma regra do cardápio e do pedido. */
  const previa = useMemo(() => {
    if (!conferido.success) return null;
    const dados = conferido.data;
    if (dados.alvo === 'CATEGORIA') {
      const quantos = produtos.filter(
        (p) => p.kind !== 'COMBO' && p.categoryId === dados.categoriaId,
      ).length;
      return {
        texto: `Vale para os ${quantos} ${quantos === 1 ? 'produto' : 'produtos'} desta seção.`,
      };
    }
    if (!produtoEscolhido) return null;
    // Sem as janelas: a prévia mostra o que a promoção faz, e não se está no ar agora.
    const simulada: PromocaoPublica = {
      ...dados,
      id: 'previa',
      inicio: null,
      fim: null,
      horaInicio: null,
      horaFim: null,
      diasDaSemana: [],
    };
    const oferta = ofertaNaVitrine(
      {
        id: produtoEscolhido.id,
        categoriaId: produtoEscolhido.categoryId,
        precoUnico: produtoEscolhido.price,
        tamanhos: produtoEscolhido.sizes.map((tamanho) => ({ preco: tamanho.price })),
      },
      [simulada],
      instante === 0 ? null : instante,
    );
    if (!oferta) return { texto: 'Com esses valores a promoção não baixa o preço de hoje.' };
    if (oferta.de === null || oferta.por === null) return { texto: oferta.rotulo };
    return { de: oferta.de, por: oferta.por, rotulo: oferta.rotulo };
  }, [conferido, produtoEscolhido, produtos, instante]);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroDoServidor(null);
    const resultado = storePromotionSchema.safeParse(paraOPayload(r, promocao?.ativa ?? true));
    if (!resultado.success) {
      const achados: Record<string, string> = {};
      for (const problema of resultado.error.issues) {
        const campo = String(problema.path[0] ?? 'nome');
        achados[campo] ??= problema.message;
      }
      setErros(achados);
      const primeiro = Object.keys(achados)[0];
      // O foco vai para o primeiro campo com erro: quem está no celular não vê o resto.
      queueMicrotask(() => document.getElementById(`campo-${primeiro}`)?.focus());
      return;
    }
    setErros({});
    salvar.mutate(paraOPayload(r, promocao?.ativa ?? true));
  }

  const moeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Qual é a promoção?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campo-nome" className="mb-2">
              Nome da promoção
            </Label>
            <Input
              id="campo-nome"
              value={r.nome}
              maxLength={60}
              placeholder="Ex.: Açaí 20% OFF"
              aria-invalid={Boolean(erros['nome'])}
              onChange={(e) => mudar({ nome: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Só você vê este nome — é para achar a promoção na lista.
            </p>
            <Erro texto={erros['nome']} />
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Onde ela vale</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(['PRODUTO', 'CATEGORIA'] as const).map((valor) => (
                <label key={valor} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="alvo"
                    checked={r.alvo === valor}
                    onChange={() => mudar({ alvo: valor })}
                    className="size-4"
                  />
                  {valor === 'PRODUTO' ? 'Em um produto' : 'Numa seção inteira'}
                </label>
              ))}
            </div>
            <Erro texto={erros['alvo']} />
          </fieldset>

          {r.alvo === 'PRODUTO' ? (
            <div>
              <Label htmlFor="campo-produtoId" className="mb-2">
                Produto
              </Label>
              <select
                id="campo-produtoId"
                value={r.produtoId}
                aria-invalid={Boolean(erros['produtoId'])}
                onChange={(e) => mudar({ produtoId: e.target.value })}
                className={SELECT}
              >
                <option value="">Escolha o produto</option>
                {produtosDoTipo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {r.tipo === 'PRECO' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  O preço promocional vale para produto de preço único. Para produto com tamanhos,
                  use desconto em %.
                </p>
              )}
              <Erro texto={erros['produtoId']} />
            </div>
          ) : (
            <div>
              <Label htmlFor="campo-categoriaId" className="mb-2">
                Seção
              </Label>
              <select
                id="campo-categoriaId"
                value={r.categoriaId}
                aria-invalid={Boolean(erros['categoriaId'])}
                onChange={(e) => mudar({ categoriaId: e.target.value })}
                className={SELECT}
              >
                <option value="">Escolha a seção</option>
                {secoes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Erro texto={erros['categoriaId']} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Que desconto?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Tipo de desconto"
            className="grid gap-2 sm:grid-cols-2"
          >
            {TIPOS.map(({ valor, explicacao }) => {
              const bloqueado = valor === 'PRECO' && r.alvo === 'CATEGORIA';
              return (
                <label
                  key={valor}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
                    r.tipo === valor ? 'border-primary bg-accent' : ''
                  } ${bloqueado ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="tipo"
                    className="mt-0.5 size-4"
                    checked={r.tipo === valor}
                    disabled={bloqueado}
                    onChange={() => mudar({ tipo: valor })}
                  />
                  <span>
                    <span className="font-medium">{NOMES_DOS_TIPOS[valor]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {bloqueado ? 'Só em um produto, e não numa seção.' : explicacao}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {r.tipo === 'PERCENTUAL' && (
            <div className="max-w-40">
              <Label htmlFor="campo-percentual" className="mb-2">
                Desconto (%)
              </Label>
              <Input
                id="campo-percentual"
                inputMode="numeric"
                value={r.percentual}
                placeholder="20"
                aria-invalid={Boolean(erros['percentual'])}
                onChange={(e) => mudar({ percentual: e.target.value })}
              />
              <Erro texto={erros['percentual']} />
            </div>
          )}

          {r.tipo === 'PRECO' && (
            <div className="max-w-48">
              <Label htmlFor="campo-precoPromocional" className="mb-2">
                Preço promocional (R$)
              </Label>
              <Input
                id="campo-precoPromocional"
                inputMode="decimal"
                value={r.preco}
                placeholder="14,90"
                aria-invalid={Boolean(erros['precoPromocional'])}
                onChange={(e) => mudar({ preco: e.target.value })}
              />
              {produtoEscolhido?.price != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Hoje custa {moeda(produtoEscolhido.price)}.
                </p>
              )}
              <Erro texto={erros['precoPromocional']} />
            </div>
          )}

          {r.tipo === 'LEVE_PAGUE' && (
            <div className="flex flex-wrap gap-4">
              <div className="w-32">
                <Label htmlFor="campo-leve" className="mb-2">
                  Leve
                </Label>
                <Input
                  id="campo-leve"
                  inputMode="numeric"
                  value={r.leve}
                  placeholder="3"
                  aria-invalid={Boolean(erros['leve'])}
                  onChange={(e) => mudar({ leve: e.target.value })}
                />
                <Erro texto={erros['leve']} />
              </div>
              <div className="w-32">
                <Label htmlFor="campo-pague" className="mb-2">
                  Pague
                </Label>
                <Input
                  id="campo-pague"
                  inputMode="numeric"
                  value={r.pague}
                  placeholder="2"
                  aria-invalid={Boolean(erros['pague'])}
                  onChange={(e) => mudar({ pague: e.target.value })}
                />
                <Erro texto={erros['pague']} />
              </div>
            </div>
          )}

          {r.tipo === 'SEGUNDO_COM_DESCONTO' && (
            <div className="max-w-56">
              <Label htmlFor="campo-percentual" className="mb-2">
                Desconto no segundo item (%)
              </Label>
              <Input
                id="campo-percentual"
                inputMode="numeric"
                value={r.percentual}
                placeholder="50"
                aria-invalid={Boolean(erros['percentual'])}
                onChange={(e) => mudar({ percentual: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">100% = o segundo é grátis.</p>
              <Erro texto={erros['percentual']} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            O desconto vale no preço do produto (ou do tamanho), e não nos adicionais. Duas
            promoções no mesmo produto não se somam: vale a que dá mais desconto.
          </p>

          {previa && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
              <p className="text-xs font-medium text-muted-foreground">Como o cliente vê</p>
              {'texto' in previa ? (
                <p className="mt-1">{previa.texto}</p>
              ) : (
                <p className="mt-1">
                  <s className="text-muted-foreground">{moeda(previa.de)}</s>{' '}
                  <strong>{moeda(previa.por)}</strong>{' '}
                  <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {previa.rotulo}
                  </span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quando vale</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sem nada marcado, vale o tempo todo, enquanto estiver ligada.
          </p>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comPeriodo}
              onCheckedChange={(v) => mudar({ comPeriodo: v === true })}
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
                  onChange={(e) => mudar({ inicio: e.target.value })}
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
                  onChange={(e) => mudar({ fim: e.target.value })}
                />
                <Erro texto={erros['fim']} />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comHorario}
              onCheckedChange={(v) => mudar({ comHorario: v === true })}
            />
            <span>Só em certos dias ou horários</span>
          </label>
          {r.comHorario && (
            <div className="space-y-3 pl-6">
              <div role="group" aria-label="Dias da semana" className="flex flex-wrap gap-1.5">
                {DIAS.map((nome, dia) => {
                  const marcado = r.dias.includes(dia);
                  return (
                    <button
                      key={nome}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() =>
                        mudar({
                          dias: marcado ? r.dias.filter((d) => d !== dia) : [...r.dias, dia],
                        })
                      }
                      className={`rounded-md border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2.5 ${
                        marcado ? 'border-primary bg-accent font-semibold' : 'text-muted-foreground'
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Nenhum dia marcado = todos os dias.</p>
              <Erro texto={erros['diasDaSemana']} />
              <div className="flex flex-wrap gap-4">
                <div>
                  <Label htmlFor="campo-horaInicio" className="mb-2">
                    Das
                  </Label>
                  <Input
                    id="campo-horaInicio"
                    type="time"
                    value={r.horaInicio}
                    aria-invalid={Boolean(erros['horaInicio'])}
                    onChange={(e) => mudar({ horaInicio: e.target.value })}
                  />
                  <Erro texto={erros['horaInicio']} />
                </div>
                <div>
                  <Label htmlFor="campo-horaFim" className="mb-2">
                    Até as
                  </Label>
                  <Input
                    id="campo-horaFim"
                    type="time"
                    value={r.horaFim}
                    aria-invalid={Boolean(erros['horaFim'])}
                    onChange={(e) => mudar({ horaFim: e.target.value })}
                  />
                  <Erro texto={erros['horaFim']} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Horário de Brasília. Passar da meia-noite (22:00 às 02:00) vale.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={r.comLimite}
              onCheckedChange={(v) => mudar({ comLimite: v === true })}
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
                placeholder="50"
                aria-invalid={Boolean(erros['limiteDeUsos'])}
                onChange={(e) => mudar({ limite: e.target.value })}
              />
              <Erro texto={erros['limiteDeUsos']} />
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
          {salvar.isPending ? 'Salvando…' : promocao ? 'Salvar alterações' : 'Criar promoção'}
        </Button>
        <Link href="/loja/marketing/promocoes" className={buttonVariants({ variant: 'ghost' })}>
          Cancelar
        </Link>
      </div>
      {!promocao && (
        <p className="text-xs text-muted-foreground">
          A promoção nasce ligada e já aparece no cardápio. Dá para desligar quando quiser.
        </p>
      )}
    </form>
  );
}
