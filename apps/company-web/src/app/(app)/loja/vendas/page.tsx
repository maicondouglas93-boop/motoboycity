'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bike,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  RotateCcw,
  Store,
  Timer,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSomLiberado } from '@/lib/avisos-do-navegador';
import {
  chamarMotoboyCityPara,
  mudarEtapa,
  recomecarVendas,
  useOperacao,
  useVendas,
} from '@/lib/loja-demo';
import { hora, momentoNaLoja, rotuloDoDia } from '@/lib/loja-horario';
import { enderecoEmLinha, type CadastroDoCliente, type VendaDaLoja } from '@/lib/loja-mock';
import {
  acaoParaAvancar,
  caminhoDoPedido,
  esperandoAHora,
  etapaParaALoja,
  inicioDoPreparo,
  nomeCurtoDaEtapa,
  prazoDoAceite,
  podeCancelar,
  podeChamarMotoboyCity,
  proximaEtapa,
  quandoChegou,
  vemDoMotoboy,
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

/**
 * O que a tela oferece para cada situação do cadastro. Três, e não um botão
 * só: quem já é cliente mas pediu de um endereço novo precisa que o ENDEREÇO
 * seja salvo, e não que um cliente duplicado seja criado.
 */
const CADASTRO: Record<CadastroDoCliente, { texto: string; acao: string | null }> = {
  novo: {
    texto: 'Este telefone não está no seu cadastro de clientes.',
    acao: 'Salvar cliente',
  },
  jaCadastrado: {
    texto: 'Já é seu cliente, e este endereço já está salvo nele.',
    acao: null,
  },
  enderecoNovo: {
    texto: 'Já é seu cliente, mas pediu de um endereço que não está salvo.',
    acao: 'Salvar este endereço no cliente',
  },
};

const CORES: Record<EtapaDoPedido, string> = {
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

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function quandoFoiFeita(venda: VendaDaLoja): Date {
  return quandoChegou(venda, 'NOVO') ?? new Date(0);
}

/** "amanhã, 12:00–12:30". */
function janelaEmTexto(venda: VendaDaLoja, agora: Date): string | null {
  if (!venda.janela) return null;
  const inicio = new Date(venda.janela.inicio);
  const fim = new Date(venda.janela.fim);
  return `${rotuloDoDia(momentoNaLoja(inicio).data, agora)}, ${hora(inicio)}–${hora(fim)}`;
}

export default function LojaVendasPage() {
  const vendas = useVendas();
  const operacao = useOperacao();
  const instante = useAgora();
  const somLiberado = useSomLiberado();
  const [aba, setAba] = useState<Aba>('andamento');
  const [confirmarRecomeco, setConfirmarRecomeco] = useState(false);

  const agora = new Date(instante);
  const manual = operacao.recebimento.modo === 'MANUAL';

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

  const abas: Array<{ valor: Aba; texto: string; lista: VendaDaLoja[] }> = [
    { valor: 'andamento', texto: 'Em andamento', lista: naFila },
    { valor: 'agendados', texto: 'Agendados', lista: agendados },
    { valor: 'concluidos', texto: 'Concluídos', lista: concluidas },
    { valor: 'cancelados', texto: 'Cancelados', lista: canceladas },
  ];
  const lista = abas.find((item) => item.valor === aba)?.lista ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Vendas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos que chegaram pela página da sua loja. Aceite {manual ? 'manual' : 'automático'} —
          muda em Tipos de pedido.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-xs text-muted-foreground">
          <span className="min-w-60 flex-1">
            Demonstração: aparecem aqui os exemplos e os pedidos feitos na página da loja{' '}
            <strong>neste navegador</strong>. Nada vai para o servidor.
          </span>
          {confirmarRecomeco ? (
            <span className="flex items-center gap-2">
              Apagar os pedidos desta demonstração?
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  recomecarVendas();
                  setConfirmarRecomeco(false);
                }}
              >
                Apagar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmarRecomeco(false)}
              >
                Não
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmarRecomeco(true)}
            >
              <RotateCcw className="size-4" /> Recomeçar os exemplos
            </Button>
          )}
        </CardContent>
      </Card>

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
                    key={venda.numero}
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
              key={venda.numero}
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
  venda: VendaDaLoja;
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

  const proxima = proximaEtapa(venda.modalidade, venda.etapa);
  const acao = acaoParaAvancar(venda.modalidade, venda.etapa, venda.entregaPor);
  const cancelavel = podeCancelar(venda.modalidade, venda.etapa, venda.entregaPor);
  const pelaLoja = venda.modalidade === 'ENTREGA' && venda.entregaPor === 'LOJA';
  /*
   * Quem leva só aparece para quem usa entregador próprio: ali convivem pedidos
   * da loja e pedidos passados ao MOTOboyCity. Para quem entrega sempre pelo
   * MOTOboyCity, seria a mesma etiqueta em todo cartão.
   */
  const mostrarQuemLeva =
    venda.modalidade === 'ENTREGA' && (quemEntregaNaLoja === 'LOJA' || pelaLoja);
  const janela = janelaEmTexto(venda, agora);
  const cadastro = CADASTRO[venda.cadastro];
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
    tempo = 'Motoboy chamado';
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
                  onClick={() => mudarEtapa(venda.numero, 'ACEITO', { minutosDePreparo: preparo })}
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
              <Button type="button" size="sm" onClick={() => mudarEtapa(venda.numero, proxima)}>
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

            {vemDoMotoboy(venda.modalidade, venda.etapa, venda.entregaPor) && (
              <span className="text-xs text-muted-foreground">
                Na versão final, esta etapa vem sozinha do aplicativo do motoboy.
              </span>
            )}
            {venda.modalidade === 'ENTREGA' && !pelaLoja && venda.etapa === 'EM_PREPARO' && (
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
              Este pedido vira corrida no MOTOboyCity e entra na sua fatura, como as demais. A saída
              e a entrega passam a chegar do aplicativo do motoboy.
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                chamarMotoboyCityPara(venda.numero);
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
              onClick={() => {
                mudarEtapa(venda.numero, 'CANCELADO', { cancelamento: { motivo, por: 'LOJA' } });
                setCancelando(false);
              }}
            >
              {venda.etapa === 'NOVO' ? 'Recusar pedido' : 'Cancelar pedido'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <span className="w-full text-xs text-muted-foreground">
              O cliente é avisado com o motivo.
              {venda.pagamento.toLowerCase().includes('online') &&
                ' Foi pago online: o estorno ainda não está definido no plano da loja.'}
            </span>
          </div>
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
                no cadastro depois. */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{venda.cliente}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {venda.telefone}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{cadastro.texto}</p>
              {cadastro.acao ? (
                <Button variant="outline" size="sm" disabled>
                  <UserPlus className="size-4" /> {cadastro.acao}
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <Check className="size-3.5" aria-hidden="true" />
                  Nada a fazer.
                </p>
              )}
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
