'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AndamentoDoPedido, SituacaoDoPagamento, StoreSettings } from '@motoboycity/types';
import {
  Bike,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageSquare,
  Phone,
  Power,
  Printer,
  Store,
  Timer,
  Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CadastroDaVenda } from '@/components/loja/cadastro-da-venda';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { CHAVE_DA_CONFIGURACAO } from '@/components/loja/link-da-loja';
import { useOperacaoDaLoja } from '@/components/loja/operacao';
import { useAcaoNaVenda, useVendasDaLoja, type VendaNoPainel } from '@/components/loja/vendas';
import { companyStoreSettingsApi } from '@/lib/api-client';
import { useSomLiberado } from '@/lib/avisos-do-navegador';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';
import { hora, momentoNaLoja, rotuloDoDia } from '@/lib/loja-horario';
import { enderecoEmLinha } from '@/lib/loja-mock';
import { session } from '@/lib/session';
import {
  acaoParaAvancar,
  caminhoDoPedido,
  concluido,
  corridaParaALoja,
  esperandoAHora,
  etapaParaALoja,
  inicioDoPreparo,
  nomeCurtoDaEtapa,
  prazoDoAceite,
  podeCancelar,
  podeChamarMotoboyCity,
  proximaEtapa,
  quandoChegou,
  segueACorrida,
  type EtapaDoPedido,
  type QuemEntrega,
} from '@/lib/loja-pedido';
import { useAgora } from '@/lib/relogio';

/**
 * O que a loja faz com cada pedido: aceitar, preparar, entregar.
 *
 * A fila de agora é separada por etapa, na ordem em que o pedido anda. O que
 * pede ação de alguém — o pedido novo esperando aceite — vem primeiro, e cada
 * cartão tem um botão só para frente, com o nome da ação ("Começar o preparo"),
 * e não da etapa: quem está com a mão suja de massa lê o verbo.
 *
 * Os agendados ficam à parte até a hora de começar. Um pedido para amanhã no
 * meio da fila da noite faria a cozinha começar a coisa errada.
 */

const CORES: Record<EtapaDoPedido, string> = {
  // A loja não vê o pedido nesta etapa; a cor existe porque o tipo tem a etapa.
  AGUARDANDO_PAGAMENTO: 'bg-muted text-muted-foreground',
  NOVO: 'bg-amber-500/15 text-amber-800',
  ACEITO: 'bg-sky-500/10 text-sky-700',
  EM_PREPARO: 'bg-orange-500/10 text-orange-700',
  PRONTO: 'bg-violet-500/10 text-violet-700',
  SAIU_PARA_ENTREGA: 'bg-indigo-500/10 text-indigo-700',
  ENTREGUE: 'bg-emerald-500/10 text-emerald-700',
  CANCELADO: 'bg-destructive/10 text-destructive',
};

/** As seções da fila de agora, na ordem em que o pedido anda. */
const SECOES_DA_FILA: Array<{ etapa: EtapaDoPedido; titulo: string }> = [
  { etapa: 'NOVO', titulo: 'Novos — esperando você aceitar' },
  { etapa: 'ACEITO', titulo: 'Aceitos' },
  { etapa: 'EM_PREPARO', titulo: 'Em preparação' },
  { etapa: 'PRONTO', titulo: 'Prontos' },
  { etapa: 'SAIU_PARA_ENTREGA', titulo: 'Saíram para entrega' },
];

const MOTIVOS = [
  'Item em falta',
  'Cozinha sem condição de atender agora',
  'Endereço fora da área de entrega',
  'Cliente pediu para cancelar',
  'Outro motivo',
];

type Aba = 'andamento' | 'agendados' | 'concluidos' | 'cancelados';

/** O pagamento online, no selo do cartão. Pago: o entregador não cobra nada. */
const PAGAMENTO_NA_VENDA: Record<SituacaoDoPagamento, string> = {
  AGUARDANDO: 'Pix aguardando',
  PAGO: 'Pago pelo Pix — não cobrar',
  NAO_PAGO: 'Pix não pago',
  ESTORNANDO: 'Pix sendo estornado',
  ESTORNADO: 'Pix estornado',
  ESTORNO_FALHOU: 'Estorno do Pix pendente',
};

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function quandoFoiFeita(venda: AndamentoDoPedido): Date {
  return quandoChegou(venda, 'NOVO') ?? new Date(0);
}

/** "amanhã, 12:00–12:30". */
function janelaEmTexto(venda: AndamentoDoPedido, agora: Date): string | null {
  if (!venda.janela) return null;
  const inicio = new Date(venda.janela.inicio);
  const fim = new Date(venda.janela.fim);
  return `${rotuloDoDia(momentoNaLoja(inicio).data, agora)}, ${hora(inicio)}–${hora(fim)}`;
}

export default function LojaVendasPage() {
  const consulta = useVendasDaLoja();
  const consultaDaOperacao = useOperacaoDaLoja();
  const operacao = consultaDaOperacao.data;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Vendas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos que chegaram pela página da sua loja
          {operacao
            ? `. Aceite ${operacao.recebimento.modo === 'MANUAL' ? 'manual' : 'automático'} — muda em Tipos de pedido.`
            : '.'}
        </p>
      </header>

      <PedidosPelaPagina />

      {consulta.isError || consultaDaOperacao.isError ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">Não foi possível carregar as vendas.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void consulta.refetch();
                void consultaDaOperacao.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : !consulta.data || !operacao ? (
        <p className="text-sm text-muted-foreground">Carregando as vendas...</p>
      ) : (
        <Fila vendas={consulta.data} operacao={operacao} />
      )}
    </div>
  );
}

/**
 * Liga e desliga os pedidos pela página. Desligada, a página é vitrine: mostra
 * o cardápio e não recebe pedido.
 */
function PedidosPelaPagina() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const configuracao = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => companyStoreSettingsApi.settings(token as string),
    enabled: Boolean(token),
  });
  const mudar = useMutation({
    mutationFn: (recebePedidos: boolean) =>
      companyStoreSettingsApi.updateAcceptsOrders(token as string, { recebePedidos }),
    onSuccess: (salva) => queryClient.setQueryData<StoreSettings>(CHAVE_DA_CONFIGURACAO, salva),
  });

  const loja = configuracao.data;
  if (!loja) return null;
  const ligados = loja.recebePedidos;

  return (
    <Card className={ligados ? 'border-emerald-500/40' : 'border-dashed'}>
      <CardContent className="space-y-2 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="min-w-60 flex-1">
            <strong>
              {ligados ? 'Pedidos pela página ligados.' : 'Pedidos pela página desligados.'}
            </strong>{' '}
            {ligados
              ? 'O cliente pede pela página da sua loja, e o pedido chega aqui.'
              : 'A página da loja mostra o cardápio, mas não recebe pedido.'}
          </span>
          {loja.slug !== null && (
            <Button
              type="button"
              size="sm"
              variant={ligados ? 'outline' : 'default'}
              disabled={mudar.isPending}
              onClick={() => mudar.mutate(!ligados)}
            >
              <Power className="size-4" /> {ligados ? 'Desligar' : 'Ligar os pedidos'}
            </Button>
          )}
        </div>
        {loja.slug === null && (
          <p className="text-xs text-muted-foreground">
            Crie o link da loja em{' '}
            <Link href="/loja/configuracoes" className="underline underline-offset-2">
              Configurações
            </Link>{' '}
            para poder ligar os pedidos.
          </p>
        )}
        {!CONTA_DISPONIVEL && (
          <p className="text-xs text-amber-800">
            O login do cliente (com Google) ainda não está configurado neste endereço: mesmo com os
            pedidos ligados, a página só aceita pedido depois dele.
          </p>
        )}
        {mudar.isError && (
          <p className="text-xs text-destructive" role="alert">
            {mensagemDoErro(mudar.error, 'Não foi possível mudar os pedidos pela página.')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Fila({
  vendas,
  operacao,
}: {
  vendas: VendaNoPainel[];
  operacao: NonNullable<ReturnType<typeof useOperacaoDaLoja>['data']>;
}) {
  const instante = useAgora();
  const somLiberado = useSomLiberado();
  const [aba, setAba] = useState<Aba>('andamento');

  const agora = new Date(instante);

  const agendados = vendas
    .filter((venda) => esperandoAHora(venda, agora))
    .sort((a, b) => (a.janela?.inicio ?? '').localeCompare(b.janela?.inicio ?? ''));
  // Na fila, o mais antigo primeiro: é o que está esperando há mais tempo.
  const naFila = vendas
    .filter(
      (venda) =>
        venda.etapa !== 'ENTREGUE' && venda.etapa !== 'CANCELADO' && !esperandoAHora(venda, agora),
    )
    .sort((a, b) => quandoFoiFeita(a).getTime() - quandoFoiFeita(b).getTime());
  const concluidas = vendas.filter((venda) => venda.etapa === 'ENTREGUE');
  const canceladas = vendas.filter((venda) => venda.etapa === 'CANCELADO');
  const esperandoAceite = naFila.filter((venda) => venda.etapa === 'NOVO');

  // O resumo é do dia, no calendário da loja — e sem as canceladas.
  const hoje = instante === 0 ? '' : momentoNaLoja(agora).data;
  const deHoje = vendas.filter(
    (venda) => venda.etapa !== 'CANCELADO' && momentoNaLoja(quandoFoiFeita(venda)).data === hoje,
  );
  const totalDoDia = deHoje.reduce((soma, venda) => soma + venda.total, 0);

  const abas: Array<{ valor: Aba; texto: string; lista: VendaNoPainel[] }> = [
    { valor: 'andamento', texto: 'Em andamento', lista: naFila },
    { valor: 'agendados', texto: 'Agendados', lista: agendados },
    { valor: 'concluidos', texto: 'Concluídos', lista: concluidas },
    { valor: 'cancelados', texto: 'Cancelados', lista: canceladas },
  ];
  const lista = abas.find((item) => item.valor === aba)?.lista ?? [];

  return (
    <div className="space-y-5">
      {/* Sem o primeiro clique, o navegador não deixa tocar som — e a lojista
          acharia que o aviso sonoro não funciona. */}
      {instante !== 0 && !somLiberado && operacao.notificacoes.lojista.NOVO_PEDIDO.som && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="size-4 shrink-0" aria-hidden="true" />
          Clique em qualquer lugar da página para liberar o som dos avisos.
        </p>
      )}

      {esperandoAceite.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <Timer className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <span>
              <strong>
                {esperandoAceite.length === 1
                  ? '1 pedido esperando você aceitar'
                  : `${esperandoAceite.length} pedidos esperando você aceitar`}
              </strong>{' '}
              — o cliente já pediu e está esperando a resposta.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Vendas hoje</p>
            <p className="mt-1 text-2xl font-bold">{deHoje.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Total do dia</p>
            <p className="mt-1 text-2xl font-bold">{moeda(totalDoDia)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="mt-1 text-2xl font-bold">
              {moeda(deHoje.length > 0 ? totalDoDia / deHoje.length : 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div role="tablist" aria-label="Vendas por situação" className="flex flex-wrap gap-2">
        {abas.map((item) => (
          <button
            key={item.valor}
            type="button"
            role="tab"
            aria-selected={aba === item.valor}
            onClick={() => setAba(item.valor)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              aba === item.valor
                ? 'border-primary bg-primary/10 font-semibold text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {item.texto}
            <span className="ml-1.5 text-xs opacity-70">{item.lista.length}</span>
          </button>
        ))}
      </div>

      {instante !== 0 && aba === 'andamento' && (
        <div className="space-y-5">
          {SECOES_DA_FILA.map(({ etapa, titulo }) => {
            const daEtapa = naFila.filter((venda) => venda.etapa === etapa);
            if (daEtapa.length === 0) return null;
            return (
              <section key={etapa} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {titulo} <span className="font-normal">· {daEtapa.length}</span>
                </h2>
                {daEtapa.map((venda) => (
                  <CartaoDaVenda
                    key={venda.id}
                    venda={venda}
                    agora={agora}
                    preparoPadrao={operacao.recebimento.minutosDePreparo}
                    prazoDoAceiteMin={operacao.recebimento.prazoDoAceiteMin}
                    quemEntregaNaLoja={operacao.entrega.quemEntrega}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}

      {instante !== 0 && aba !== 'andamento' && (
        <div className="space-y-2">
          {lista.map((venda) => (
            <CartaoDaVenda
              key={venda.id}
              venda={venda}
              agora={agora}
              preparoPadrao={operacao.recebimento.minutosDePreparo}
              prazoDoAceiteMin={operacao.recebimento.prazoDoAceiteMin}
              quemEntregaNaLoja={operacao.entrega.quemEntrega}
            />
          ))}
        </div>
      )}

      {instante !== 0 && lista.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {aba === 'andamento'
              ? 'Nenhum pedido em andamento agora.'
              : aba === 'agendados'
                ? 'Nenhum pedido agendado esperando a hora.'
                : aba === 'concluidos'
                  ? 'Nenhum pedido entregue ainda.'
                  : 'Nenhum pedido cancelado.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CartaoDaVenda({
  venda,
  agora,
  preparoPadrao,
  prazoDoAceiteMin,
  quemEntregaNaLoja,
}: {
  venda: VendaNoPainel;
  agora: Date;
  preparoPadrao: number;
  prazoDoAceiteMin: number | null;
  /** Como a loja entrega hoje — decide se vale mostrar quem leva cada pedido. */
  quemEntregaNaLoja: QuemEntrega;
}) {
  const [expandida, setExpandida] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [chamando, setChamando] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0] ?? '');
  const [preparo, setPreparo] = useState(preparoPadrao);
  const acaoNaVenda = useAcaoNaVenda();
  const ocupado = acaoNaVenda.isPending;

  const proxima = proximaEtapa(venda.modalidade, venda.etapa);
  const acao = acaoParaAvancar(venda.modalidade, venda.etapa, venda.entregaPor);
  const cancelavel = podeCancelar(venda.modalidade, venda.etapa, venda.entregaPor);
  const pelaLoja = venda.modalidade === 'ENTREGA' && venda.entregaPor === 'LOJA';
  const pelaCorrida = segueACorrida(venda);
  const corridaCancelada = venda.corrida?.situacao === 'CANCELADA';
  const naoEntregou = venda.corrida?.situacao === 'NAO_ENTREGUE';
  const etapaComCorrida =
    venda.etapa === 'ACEITO' || venda.etapa === 'EM_PREPARO' || venda.etapa === 'PRONTO';
  // A corrida: o que ela está fazendo, enquanto o pedido não terminou.
  const linhaDaCorrida =
    pelaCorrida && venda.corrida && !corridaCancelada && !concluido(venda.etapa)
      ? `${corridaParaALoja(venda.corrida)} · corrida #${venda.corrida.numero}`
      : null;
  /*
   * Quem leva só aparece para quem usa entregador próprio: ali convivem pedidos
   * da loja e pedidos passados ao MOTOboyCity. Para quem entrega sempre pelo
   * MOTOboyCity, seria a mesma etiqueta em todo cartão.
   */
  const mostrarQuemLeva =
    venda.modalidade === 'ENTREGA' && (quemEntregaNaLoja === 'LOJA' || pelaLoja);
  const janela = janelaEmTexto(venda, agora);
  const inicioAgendado = inicioDoPreparo(venda);
  const caminho = caminhoDoPedido(venda.modalidade);
  const indiceAtual = caminho.indexOf(venda.etapa);

  // O que a cozinha precisa saber sobre o tempo, conforme a etapa.
  let tempo: string | null = null;
  const prazo = prazoDoAceite(venda, prazoDoAceiteMin);
  if (prazo) {
    const faltam = Math.max(0, Math.ceil((prazo.getTime() - agora.getTime()) / 60_000));
    tempo = venda.janela
      ? `Aceite até ${hora(prazo)}, quando a cozinha precisa começar — senão cancela sozinho`
      : `Cancela sozinho em ${faltam} min (${hora(prazo)}), se ninguém aceitar`;
  } else if (
    venda.etapa === 'ACEITO' &&
    inicioAgendado &&
    agora.getTime() < inicioAgendado.getTime()
  ) {
    tempo = `Começar o preparo às ${hora(inicioAgendado)}`;
  } else if (venda.etapa === 'ACEITO' && inicioAgendado) {
    tempo = 'Hora de começar o preparo';
  } else if (venda.etapa === 'EM_PREPARO') {
    const aceito = quandoChegou(venda, 'ACEITO');
    if (aceito && !venda.janela) {
      tempo = `Pronto previsto às ${hora(new Date(aceito.getTime() + venda.minutosDePreparo * 60_000))}`;
    }
  } else if (venda.etapa === 'PRONTO' && pelaLoja) {
    tempo = 'Esperando o seu entregador sair';
  } else if (venda.etapa === 'PRONTO' && venda.modalidade === 'ENTREGA') {
    // A corrida diz o resto, na linha dela.
    tempo = null;
  } else if (venda.etapa === 'PRONTO') {
    tempo = 'Esperando o cliente buscar';
  }

  return (
    <Card className={venda.etapa === 'NOVO' ? 'border-amber-500/50' : undefined}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-24">
            <p className="font-semibold">#{venda.numero}</p>
            <p className="text-xs text-muted-foreground">{hora(quandoFoiFeita(venda))}</p>
          </div>

          <div className="min-w-40 flex-1">
            <p className="text-sm font-medium">{venda.cliente}</p>
            <p className="text-xs text-muted-foreground">
              {venda.itens.length} {venda.itens.length === 1 ? 'item' : 'itens'} · {venda.pagamento}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="gap-1">
                {venda.modalidade === 'RETIRADA' ? (
                  <Store className="size-3" aria-hidden="true" />
                ) : (
                  <MapPin className="size-3" aria-hidden="true" />
                )}
                {venda.modalidade === 'RETIRADA' ? 'Retirada' : 'Entrega'}
              </Badge>
              {mostrarQuemLeva && (
                <Badge variant="outline" className="gap-1">
                  <Bike className="size-3" aria-hidden="true" />
                  {pelaLoja ? 'Entregador da loja' : 'Motoboy do MOTOboyCity'}
                </Badge>
              )}
              {venda.pagamentoOnline && (
                <Badge variant="outline" className="gap-1">
                  <Check className="size-3" aria-hidden="true" />
                  {PAGAMENTO_NA_VENDA[venda.pagamentoOnline.situacao]}
                </Badge>
              )}
              {janela && (
                <Badge variant="outline" className="gap-1">
                  <CalendarClock className="size-3" aria-hidden="true" />
                  {janela}
                </Badge>
              )}
            </div>
          </div>

          <p className="font-semibold">{moeda(venda.total)}</p>

          <Badge className={CORES[venda.etapa]} variant="secondary">
            {etapaParaALoja(venda.etapa, venda.modalidade)}
          </Badge>
        </div>

        {/* A régua: onde o pedido está no caminho dele. */}
        {venda.etapa !== 'CANCELADO' && (
          <ol className="flex gap-1" aria-label="Etapas do pedido">
            {caminho.map((etapa, indice) => (
              <li
                key={etapa}
                className={`h-1.5 flex-1 rounded-full ${indice <= indiceAtual ? 'bg-primary' : 'bg-muted'}`}
                title={nomeCurtoDaEtapa(etapa, venda.modalidade)}
              >
                <span className="sr-only">
                  {nomeCurtoDaEtapa(etapa, venda.modalidade)}
                  {indice <= indiceAtual ? ' (feito)' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}

        {tempo && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" aria-hidden="true" />
            {tempo}
          </p>
        )}

        {venda.pagamentoOnline?.aviso && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
          >
            {venda.pagamentoOnline.aviso}
          </p>
        )}

        {linhaDaCorrida && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bike className="size-3.5" aria-hidden="true" />
            {linhaDaCorrida}
          </p>
        )}

        {/* A corrida que não nasceu, foi cancelada ou não entregou: a loja
            decide — chamar de novo, ou levar com o próprio entregador. */}
        {venda.avisoDaCorrida && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
            <p className="w-full text-xs" role="status">
              {venda.avisoDaCorrida}
            </p>
            {etapaComCorrida && (!venda.corrida || corridaCancelada) && (
              <Button
                type="button"
                size="sm"
                disabled={ocupado}
                onClick={() => acaoNaVenda.mutate({ tipo: 'chamarDeNovo', id: venda.id })}
              >
                <Bike className="size-4" /> Chamar o motoboy de novo
              </Button>
            )}
            {(etapaComCorrida || naoEntregou) &&
              (!venda.corrida || corridaCancelada || naoEntregou) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => acaoNaVenda.mutate({ tipo: 'entregarComALoja', id: venda.id })}
                >
                  Entregar com o entregador da loja
                </Button>
              )}
          </div>
        )}

        {venda.etapa === 'CANCELADO' && venda.cancelamento && (
          <p className="text-xs text-muted-foreground">
            Cancelado
            {venda.cancelamento.por === 'CLIENTE'
              ? ' pelo cliente'
              : venda.cancelamento.por === 'SISTEMA'
                ? ' pelo sistema'
                : ''}
            {venda.cancelamento.motivo ? ` · ${venda.cancelamento.motivo}` : ''}
          </p>
        )}

        {/* A ação. Aceitar tem o preparo junto: é ali que a loja diz "hoje
            está cheio, vai levar 40". */}
        {!cancelando && !chamando && (proxima || cancelavel) && (
          <div className="flex flex-wrap items-center gap-2">
            {venda.etapa === 'NOVO' && proxima && (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    acaoNaVenda.mutate({
                      tipo: 'avancar',
                      id: venda.id,
                      para: 'ACEITO',
                      minutosDePreparo: preparo,
                    })
                  }
                >
                  <Check className="size-4" /> Aceitar
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Preparo
                  <select
                    value={preparo}
                    onChange={(evento) => setPreparo(Number(evento.target.value))}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    aria-label={`Tempo de preparo do pedido ${venda.numero}`}
                  >
                    {[0, 10, 20, 30].map((extra) => (
                      <option key={extra} value={preparoPadrao + extra}>
                        {preparoPadrao + extra} min{extra === 0 ? ' (padrão)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCancelando(true)}>
                  Recusar
                </Button>
              </>
            )}

            {venda.etapa !== 'NOVO' && proxima && acao && (
              <Button
                type="button"
                size="sm"
                disabled={ocupado}
                onClick={() =>
                  proxima !== 'AGUARDANDO_PAGAMENTO' &&
                  proxima !== 'NOVO' &&
                  proxima !== 'CANCELADO' &&
                  acaoNaVenda.mutate({ tipo: 'avancar', id: venda.id, para: proxima })
                }
              >
                {acao}
              </Button>
            )}

            {venda.etapa !== 'NOVO' && cancelavel && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setCancelando(true)}>
                Cancelar pedido
              </Button>
            )}

            {podeChamarMotoboyCity(venda) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setChamando(true)}>
                <Bike className="size-4" /> Chamar motoboy do MOTOboyCity
              </Button>
            )}

            {pelaCorrida && venda.etapa === 'EM_PREPARO' && (
              <span className="text-xs text-muted-foreground">
                Depois de pronto, cancelar passa a ser com a central: o motoboy já foi chamado.
              </span>
            )}
          </div>
        )}

        {/* Passar para o MOTOboyCity custa uma corrida e não tem volta pela
            loja: por isso pergunta antes, dizendo o que muda. */}
        {chamando && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
            <span className="w-full text-xs">
              Este pedido passa a ser entregue por um motoboy do MOTOboyCity: pronto, o motoboy é
              chamado na hora; antes, para quando ficar pronto. A corrida entra na sua fatura, como
              as demais.
            </span>
            <Button
              type="button"
              size="sm"
              disabled={ocupado}
              onClick={() => {
                acaoNaVenda.mutate({ tipo: 'chamarMotoboyCity', id: venda.id });
                setChamando(false);
              }}
            >
              Chamar motoboy
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChamando(false)}>
              Voltar
            </Button>
          </div>
        )}

        {cancelando && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
            <label className="flex items-center gap-2 text-xs">
              Motivo
              <select
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                {MOTIVOS.map((texto) => (
                  <option key={texto} value={texto}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={ocupado}
              onClick={() => {
                acaoNaVenda.mutate({ tipo: 'cancelar', id: venda.id, motivo });
                setCancelando(false);
              }}
            >
              {venda.etapa === 'NOVO' ? 'Recusar pedido' : 'Cancelar pedido'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <span className="w-full text-xs text-muted-foreground">
              O cliente vê o motivo em Meus pedidos.
            </span>
          </div>
        )}

        {acaoNaVenda.isError && (
          <p className="text-xs text-destructive" role="alert">
            {mensagemDoErro(acaoNaVenda.error, 'Não foi possível mudar o pedido.')}
          </p>
        )}

        <div className="-ml-2 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpandida((atual) => !atual)}
            aria-expanded={expandida}
          >
            {expandida ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Detalhes
          </Button>
          {/* Numa aba nova: a fila de Vendas continua aberta, e com ela o som
              do próximo pedido. */}
          <Link
            href={`/loja/vendas/${venda.numero}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <Printer className="size-4" aria-hidden="true" /> Imprimir
          </Link>
        </div>

        {expandida && (
          <div className="space-y-3 border-t pt-3 text-sm">
            <ul className="space-y-2">
              {venda.itens.map((item, indice) => (
                <li key={`${venda.numero}-${indice}`} className="flex justify-between gap-4">
                  <span>
                    <span className="font-medium">
                      {item.quantidade}× {item.nome}
                      {item.tamanho && ` — ${item.tamanho}`}
                    </span>
                    {item.escolhas.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {item.escolhas.join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0">{moeda(item.total)}</span>
                </li>
              ))}
            </ul>

            {/* O cliente do PWA vira cliente da loja aqui, com os dados que
                ele mesmo digitou no checkout — em vez de alguém redigitar tudo
                no cadastro depois. Retirada não tem endereço para salvar. */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{venda.cliente}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {venda.telefone}
                </span>
              </div>
              {venda.entrega && <CadastroDaVenda venda={venda} />}
            </div>

            {/* O que o cliente escreveu vai para quem prepara, e por isso não
                pode virar texto cinza no meio do resto. */}
            {venda.observacao && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
                <MessageSquare
                  className="mt-0.5 size-4 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                {venda.observacao}
              </p>
            )}

            <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {venda.entrega === null ? (
                /* Retirada não gera entrega: ninguém vai buscar, e mostrar um
                   endereço aqui faria a loja chamar motoboy à toa. */
                <p className="flex items-start gap-1.5 font-medium text-foreground">
                  <Store className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />O cliente retira
                  na loja — sem entrega.
                </p>
              ) : (
                <p className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {enderecoEmLinha(venda.entrega)}
                    {venda.entrega.referencia && (
                      // Referência é o que faz o motoboy achar a casa.
                      <span className="block">{venda.entrega.referencia}</span>
                    )}
                  </span>
                </p>
              )}
              <p>
                Pagamento: {venda.pagamento}
                {venda.trocoPara !== null && (
                  // Troco é a informação que o motoboy precisa levar na mão.
                  // Enterrada numa observação de texto, ela se perde — por
                  // isso aparece destacada.
                  <strong className="text-foreground">
                    {' '}
                    · troco para {moeda(venda.trocoPara)}
                  </strong>
                )}
              </p>
            </div>

            {/* O histórico com hora: é a resposta para "que horas esse pedido
                ficou pronto?" quando o cliente reclama da demora. */}
            <ol className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {venda.historico.map((passo) => (
                <li key={`${passo.etapa}-${passo.em}`} className="flex gap-2">
                  <span className="w-12 shrink-0 tabular-nums">{hora(new Date(passo.em))}</span>
                  <span>{etapaParaALoja(passo.etapa, venda.modalidade)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
