'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import {
  FORMAS_DE_PAGAMENTO,
  GRUPOS_DE_PAGAMENTO,
  LOJA_DE_EXEMPLO,
  descricaoDaForma,
  formasOferecidas,
  rotuloDoPagamento,
  type EnderecoDaEntrega,
  type FormaDePagamento,
} from '@/lib/loja-mock';
import {
  DIAS_DA_SEMANA,
  dataCurta,
  diaDaSemana,
  hora,
  momentoNaLoja,
  rotuloDoDia,
  situacaoDaLoja,
} from '@/lib/loja-horario';
import {
  horariosDaModalidade,
  modalidadesAtivas,
  pedidoMinimoDa,
  textoDoTempo,
} from '@/lib/loja-operacao';
import { inicioDoPedido, type JanelaAgendada, type Modalidade } from '@/lib/loja-pedido';
import { proximoNumeroDeVenda, registrarVenda, useOperacao } from '@/lib/loja-demo';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';
import type { CardapioDaPagina } from '@/lib/loja-publica';
import { acertarRelogio, useAgora } from '@/lib/relogio';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import {
  ajustarQuantidade,
  clienteSalvo,
  guardarCliente,
  guardarPedido,
  proximoNumero,
  useHidratado,
  useSacola,
} from '@/components/loja-online/armazenamento';
import { PorteiraDeLogin, useConta } from '@/components/loja-online/conta';
import { CURVA_FOLHA, DURACAO } from '@/components/loja-online/movimento';

/**
 * Sacola e checkout na MESMA página.
 *
 * Separar em duas etapas acrescenta um toque e uma tela a quem já decidiu
 * comprar. O cliente confere o que escolheu e preenche a entrega rolando para
 * baixo, sem perder de vista o que está levando.
 *
 * A loja de verdade (`cardapio.operacao` do banco) usa as cores, os bairros, o
 * pagamento e a retirada que gravou, e manda o pedido à API — que confere tudo
 * de novo. A demonstração segue com os dados de exemplo e o `localStorage`.
 */

/** A frase que o servidor mandou ao recusar, ou uma genérica. */
function motivoDaRecusa(erro: unknown): string {
  return erro instanceof ApiError && erro.message
    ? erro.message
    : 'Não deu para enviar o pedido agora. Confira a internet e tente de novo.';
}

/** "Hoje", "Amanhã", "Sex 26/09" — o nome do dia sozinho confunde quando a semana vira. */
function rotuloDoDiaComData(data: string, agora: Date): string {
  const rotulo = rotuloDoDia(data, agora);
  if (rotulo === 'hoje') return 'Hoje';
  if (rotulo === 'amanhã') return 'Amanhã';
  return `${(DIAS_DA_SEMANA[diaDaSemana(data)] ?? '').slice(0, 3)} ${dataCurta(data)}`;
}

const ENDERECO_VAZIO: EnderecoDaEntrega = {
  rua: '',
  numero: '',
  complemento: null,
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  referencia: null,
};

/**
 * A casca espera DUAS coisas antes de montar o conteúdo: a hidratação do React
 * e o carregamento da conta (o login do Firebase).
 *
 * Não é enfeite. Os campos precisam NASCER preenchidos com o endereço que está
 * na conta, e `useState` só olha o valor inicial na primeira renderização. Se
 * o conteúdo montar antes de a conta dizer quem é, essa primeira renderização
 * não tem conta, não acha endereço nenhum, e o formulário nasce vazio para
 * sempre — mesmo com o endereço salvo ali do lado.
 */
export function Sacola({ slug, cardapio }: { slug: string; cardapio: CardapioDaPagina }) {
  const marca = cardapio.identidade;
  const paleta = paletaDoTema(marca.tema);
  const hidratado = useHidratado();
  const conta = useConta();

  if (!hidratado || !conta.carregada) {
    return (
      <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
        <div className="h-1" style={{ backgroundColor: marca.corDaMarca }} />
      </div>
    );
  }

  // A loja ainda não recebe pedido pela página: dito aqui, antes de o cliente
  // preencher tudo para ouvir "não" no fim.
  if (cardapio.vitrine) {
    return (
      <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
        <div className="h-1" style={{ backgroundColor: marca.corDaMarca }} />
        <main className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
          <p className="text-base font-semibold">Esta loja ainda não recebe pedidos por aqui</p>
          <p className="text-sm" style={{ color: paleta.suave }}>
            Dá para ver o cardápio — para pedir, fale com a loja.
          </p>
          <Link
            href={`/pedir/${slug}`}
            className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold"
            style={{ backgroundColor: marca.corDeAcao, color: textoSobre(marca.corDeAcao) }}
          >
            Ver o cardápio
          </Link>
        </main>
      </div>
    );
  }

  return <Conteudo slug={slug} cardapio={cardapio} usuarioId={conta.usuarioId} />;
}

function Conteudo({
  slug,
  cardapio,
  usuarioId,
}: {
  slug: string;
  cardapio: CardapioDaPagina;
  usuarioId: string | null;
}) {
  const router = useRouter();
  const loja = LOJA_DE_EXEMPLO;
  const marca = cardapio.identidade;
  const paleta = paletaDoTema(marca.tema);
  const [enviando, setEnviando] = useState(false);

  const { itens, setItens } = useSacola(slug);

  // O endereço vem da CONTA, e não do aparelho. É a mesma ideia do "salvar
  // cliente" do painel, vista do outro lado: os dados já existem, só faltava
  // alguém reaproveitá-los.
  const anterior = useMemo(
    () => (usuarioId === null ? null : clienteSalvo(slug, usuarioId)),
    [slug, usuarioId],
  );

  const [nome, setNome] = useState(anterior?.nome ?? '');
  const [telefone, setTelefone] = useState(anterior?.telefone ?? '');
  const [entrega, setEntrega] = useState<EnderecoDaEntrega>(anterior?.entrega ?? ENDERECO_VAZIO);
  // A loja de verdade oferece o que gravou (o servidor já tirou as online sem
  // conta Asaas); a demonstração, as do exemplo.
  const oferecidas = cardapio.operacao?.pagamentos ?? formasOferecidas(loja);
  const bairros = cardapio.operacao?.bairros ?? loja.bairros;
  const [pagamento, setPagamento] = useState<FormaDePagamento>(oferecidas[0] ?? 'DINHEIRO');
  const [trocoPara, setTrocoPara] = useState('');
  const [observacao, setObservacao] = useState('');

  const operacaoDaDemonstracao = useOperacao();
  const operacao = cardapio.operacao ?? operacaoDaDemonstracao;
  const instante = useAgora();
  const situacao = situacaoDaLoja(operacao.funcionamento, new Date(instante));

  /*
   * Só o que a loja oferece. Se ela desligar a modalidade escolhida com a
   * página aberta, a escolha cai para a que sobrou, em vez de mandar um pedido
   * que a loja não aceita mais.
   */
  const modalidades = modalidadesAtivas(operacao);
  const [modalidadeEscolhida, setModalidade] = useState<Modalidade>(modalidades[0] ?? 'ENTREGA');
  const modalidade = modalidades.includes(modalidadeEscolhida)
    ? modalidadeEscolhida
    : (modalidades[0] ?? 'ENTREGA');
  const retirar = modalidade === 'RETIRADA';

  const dias = useMemo(
    () => horariosDaModalidade(operacao, modalidade, new Date(instante)),
    [operacao, modalidade, instante],
  );
  const podeAgendar = dias.length > 0;
  const intervalo = operacao.agendamento.intervaloMin;

  // Com a loja fechada, a página já chega em "Agendar": é a única opção que
  // leva a um pedido.
  const [quandoEscolhido, setQuando] = useState<'AGORA' | 'AGENDAR'>(() =>
    situacao.aberta ? 'AGORA' : 'AGENDAR',
  );
  const quando = quandoEscolhido === 'AGENDAR' && podeAgendar ? 'AGENDAR' : 'AGORA';
  const [diaEscolhido, setDia] = useState<string | null>(null);
  const [horarioEscolhido, setHorario] = useState<number | null>(null);
  const dia = dias.find((item) => item.data === diaEscolhido) ?? dias[0] ?? null;
  // O horário que saiu da lista — o tempo passou — cai para o primeiro que
  // ainda vale, em vez de ficar escolhido um horário que a loja não aceita.
  const horario =
    dia?.horarios.find((item) => item.getTime() === horarioEscolhido) ?? dia?.horarios[0] ?? null;
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * "19:00 – 19:30" na entrega, "A partir de 19:00" na retirada. A janela
   * depois da meia-noite, que conta na noite anterior, vem marcada — para
   * ninguém escolher 00:30 achando que é meio-dia e meia.
   */
  function rotuloDaJanela(inicio: Date, diaDaNoite: string): string {
    const fim = new Date(inicio.getTime() + intervalo * 60_000);
    const base = retirar ? `A partir de ${hora(inicio)}` : `${hora(inicio)} – ${hora(fim)}`;
    return momentoNaLoja(inicio).data !== diaDaNoite ? `${base} · madrugada` : base;
  }
  const enderecoDeRetirada = cardapio.operacao
    ? cardapio.enderecoDeRetirada
    : (operacao.retirada.endereco ?? loja.pontoDeColeta);
  const indisponivel =
    modalidades.length === 0 ||
    (quando === 'AGORA' && !situacao.aberta) ||
    (quando === 'AGENDAR' && horario === null);

  /*
   * O bairro vem de uma LISTA, e não de um campo livre.
   *
   * É ele que define a taxa, e é ele que limita a área: bairro fora da lista
   * simplesmente não é oferecido. Um campo de texto aqui aceitaria endereço a
   * quarenta quilômetros e a loja só descobriria com o motoboy na rua.
   */
  const bairroEscolhido = bairros.find((bairro) => bairro.nome === entrega.bairro) ?? null;

  const subtotal = itens.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);
  // Retirada não tem entrega, logo não tem taxa: o cliente busca no balcão.
  const taxa = retirar ? 0 : (bairroEscolhido?.taxa ?? 0);
  const total = subtotal + taxa;
  const emDinheiro = pagamento === 'DINHEIRO';
  const pagaOnline = descricaoDaForma(pagamento).grupo === 'ONLINE';

  // O mínimo conta só os itens: somar a entrega faria a taxa ajudar a atingir
  // o mínimo, que é o contrário do que o mínimo existe para proteger. E vale só
  // na entrega — na retirada não há taxa para proteger.
  const minimo = pedidoMinimoDa(operacao, modalidade);
  const faltaParaOMinimo = minimo !== null && subtotal < minimo ? minimo - subtotal : 0;

  const faltando: string[] = [];
  if (nome.trim() === '') faltando.push('seu nome');
  if (telefone.trim().length < 10) faltando.push('o telefone');
  // Na retirada o endereço não é pedido, então também não pode ser exigido.
  if (!retirar) {
    if (entrega.rua.trim() === '') faltando.push('a rua');
    if (entrega.numero.trim() === '') faltando.push('o número');
    if (bairroEscolhido === null) faltando.push('o bairro');
    if (entrega.cidade.trim() === '') faltando.push('a cidade');
  }

  function alterarQuantidade(indice: number, passo: number) {
    setItens((atual) => ajustarQuantidade(atual, indice, passo));
  }

  function confirmar() {
    if (usuarioId === null) return;

    /*
     * Confere de novo na hora de enviar: a página pode ter ficado aberta
     * enquanto a loja fechou, pausou, ou o horário escolhido passou. Na
     * integração quem confere é o servidor — aqui é a mesma regra, no único
     * lugar que existe.
     */
    const momento = new Date(acertarRelogio());
    let janela: JanelaAgendada | null = null;
    if (quando === 'AGENDAR') {
      const aindaVale =
        horario !== null &&
        horariosDaModalidade(operacao, modalidade, momento).some((item) =>
          item.horarios.some((opcao) => opcao.getTime() === horario.getTime()),
        );
      if (!aindaVale || horario === null) {
        setAviso('Esse horário acabou de sair da lista. Escolha outro.');
        return;
      }
      janela = {
        inicio: horario.toISOString(),
        fim: new Date(horario.getTime() + intervalo * 60_000).toISOString(),
      };
    } else if (!situacaoDaLoja(operacao.funcionamento, momento).aberta) {
      setAviso('A loja acabou de parar de receber pedidos para agora.');
      return;
    }

    const troco =
      emDinheiro && trocoPara.trim() !== '' ? Number(trocoPara.replace(',', '.')) : null;
    if (troco !== null && !(troco > 0)) {
      setAviso('Informe o troco como um valor, por exemplo 50,00.');
      return;
    }
    const nota = observacao.trim() === '' ? null : observacao.trim();

    if (cardapio.operacao) {
      void enviarPedido(usuarioId, janela, troco, nota);
      return;
    }

    // O número vem da lista de vendas da demonstração, e não só dos pedidos
    // desta conta: duas contas no mesmo navegador não podem dividir um número.
    const numero = Math.max(proximoNumero(slug, usuarioId), proximoNumeroDeVenda());
    const { minutosDePreparo, minutosDeEntrega } = operacao.recebimento;

    guardarPedido(slug, usuarioId, {
      numero,
      criadoEm: momento.toISOString(),
      itens,
      subtotal,
      taxaDeEntrega: taxa,
      total,
      pagamento: rotuloDoPagamento(pagamento),
      trocoPara: troco,
      nome: nome.trim(),
      telefone: telefone.trim(),
      entrega,
      minutosDePreparo,
      minutosDeEntrega,
      observacao: nota,
      retirarNaLoja: retirar,
      janela,
    });

    // Na demonstração, a venda chega ao painel pelo mesmo navegador.
    registrarVenda({
      numero,
      modalidade,
      entregaPor: retirar ? null : operacao.entrega.quemEntrega,
      ...inicioDoPedido(operacao.recebimento.modo, momento),
      janela,
      minutosDePreparo,
      minutosDeEntrega,
      cancelamento: null,
      cliente: nome.trim(),
      telefone: telefone.trim(),
      total,
      itens: itens.map((item) => ({
        nome: item.nome,
        quantidade: item.quantidade,
        tamanho: item.tamanho,
        escolhas: item.escolhas,
        total: item.unitario * item.quantidade,
      })),
      pagamento: rotuloDoPagamento(pagamento),
      trocoPara: troco,
      entrega: retirar ? null : entrega,
      cadastro: 'novo',
      observacao: nota,
      contaDoCliente: usuarioId,
    });

    setItens([]);
    router.push(`/pedir/${slug}/pedidos?novo=${numero}`);
  }

  /**
   * O pedido da loja de verdade, pela API. Preço nenhum vai daqui: o servidor
   * calcula com o cardápio e os bairros, e confere o total que o cliente viu —
   * se algo mudou desde a sacola, ele recusa dizendo o quê, e nada é gravado.
   */
  async function enviarPedido(
    conta: string,
    janela: JanelaAgendada | null,
    troco: number | null,
    nota: string | null,
  ) {
    setEnviando(true);
    setAviso(null);
    try {
      const token = await tokenDoCliente();
      if (!token) {
        setAviso('Sua sessão expirou. Entre de novo para pedir.');
        return;
      }
      const pedido = await publicStoreOrdersApi.checkout(slug, token, {
        modalidade,
        itens: itens.map((item) => ({
          produtoId: item.produtoId,
          tamanhoId: item.tamanhoId ?? null,
          escolhas: item.escolhaIds ?? [],
          quantidade: item.quantidade,
        })),
        agendadoPara: janela?.inicio ?? null,
        cliente: { nome: nome.trim(), telefone: telefone.trim() },
        entrega:
          retirar || !bairroEscolhido
            ? null
            : {
                rua: entrega.rua.trim(),
                numero: entrega.numero.trim(),
                complemento: entrega.complemento?.trim() || null,
                bairroId: bairroEscolhido.id,
                cidade: entrega.cidade.trim(),
                estado: entrega.estado.trim(),
                cep: entrega.cep.trim(),
                referencia: entrega.referencia?.trim() || null,
              },
        pagamento,
        trocoPara: troco,
        observacao: nota,
        totalVisto: total,
      });
      guardarCliente(slug, conta, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        entrega: retirar ? null : entrega,
      });
      setItens([]);
      router.push(`/pedir/${slug}/pedidos?novo=${pedido.numero}`);
    } catch (erro) {
      setAviso(motivoDaRecusa(erro));
    } finally {
      setEnviando(false);
    }
  }

  const campo = {
    backgroundColor: paleta.fundo,
    borderColor: paleta.linha,
    color: paleta.texto,
  };

  return (
    <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
      <div className="h-1" style={{ backgroundColor: marca.corDaMarca }} />

      <div className="mx-auto w-full max-w-lg pb-28">
        <header
          className="flex items-center gap-2 border-b px-3 py-3"
          style={{ borderColor: paleta.linha }}
        >
          <Link href={`/pedir/${slug}`} aria-label="Voltar ao cardápio" className="-ml-1 p-1">
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-lg font-bold">Finalizar pedido</h1>
        </header>

        {itens.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm" style={{ color: paleta.suave }}>
              Sua sacola está vazia.
            </p>
            <Link
              href={`/pedir/${slug}`}
              className="mt-4 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold"
              style={{ backgroundColor: marca.corDeAcao, color: textoSobre(marca.corDeAcao) }}
            >
              Ver o cardápio
            </Link>
          </div>
        ) : (
          <>
            <section>
              {itens.map((item, indice) => (
                <div
                  key={`${item.produtoId}-${indice}`}
                  className="flex items-start gap-3 border-b px-4 py-3"
                  style={{ borderColor: paleta.linha }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">
                      {item.nome}
                      {item.tamanho && ` · ${item.tamanho}`}
                    </p>
                    {item.escolhas.length > 0 && (
                      <p className="mt-0.5 text-[13px]" style={{ color: paleta.suave }}>
                        {item.escolhas.join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-[15px] font-semibold">
                      {moeda(item.unitario * item.quantidade)}
                    </p>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-1 rounded-full border"
                    style={{ borderColor: paleta.linha }}
                  >
                    <button
                      type="button"
                      aria-label={`Menos um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, -1)}
                      className="rounded-full p-2"
                    >
                      {item.quantidade === 1 ? (
                        <Trash2 className="size-4" />
                      ) : (
                        <Minus className="size-4" />
                      )}
                    </button>
                    <span className="w-4 text-center text-sm font-medium">{item.quantidade}</span>
                    <button
                      type="button"
                      aria-label={`Mais um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, 1)}
                      className="rounded-full p-2"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="space-y-1 px-4 py-3 text-sm">
                <div className="flex justify-between" style={{ color: paleta.suave }}>
                  <span>Itens</span>
                  <span>{moeda(subtotal)}</span>
                </div>
                <div className="flex justify-between" style={{ color: paleta.suave }}>
                  <span>
                    {retirar
                      ? 'Retirada'
                      : `Entrega${bairroEscolhido ? ` · ${bairroEscolhido.nome}` : ''}`}
                  </span>
                  <span>
                    {retirar ? 'sem taxa' : bairroEscolhido ? moeda(taxa) : 'escolha o bairro'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span>{moeda(total)}</span>
                </div>
              </div>
            </section>

            {/* A loja exige conta para comprar. Ver o cardápio e montar a
                sacola não exige — a porteira fica aqui, no fim, e não na
                porta de entrada. */}
            {usuarioId === null ? (
              <PorteiraDeLogin
                paleta={paleta}
                corDeAcao={marca.corDeAcao}
                textoDoBotao="Entrar e continuar"
                resumo={`Sua sacola tem ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}, ${moeda(total)} com a entrega.`}
              />
            ) : (
              <>
                {/* Nome e telefone ficam FORA da parte que recolhe: são
                    obrigatórios também para retirar. Uma versão anterior os
                    guardava junto do endereço, e quem escolhia retirada via
                    "falta preencher o telefone" sem campo nenhum na tela. */}
                <section className="border-t pt-4" style={{ borderColor: paleta.linha }}>
                  <h2 className="px-4 pb-2 text-base font-bold">Seus dados</h2>
                  <div className="space-y-3 px-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Campo
                        id="nome"
                        rotulo="Seu nome"
                        valor={nome}
                        aoMudar={setNome}
                        estilo={campo}
                        paleta={paleta}
                        className="col-span-2"
                      />
                      <Campo
                        id="telefone"
                        rotulo="Telefone"
                        valor={telefone}
                        aoMudar={setTelefone}
                        estilo={campo}
                        paleta={paleta}
                        inputMode="tel"
                        dica={
                          retirar
                            ? 'É por ele que a loja avisa se precisar falar com você.'
                            : 'É por ele que o motoboy liga se não achar o endereço.'
                        }
                        className="col-span-2"
                      />
                    </div>
                  </div>
                </section>

                {/* A escolha vem ANTES do endereço: quem vai retirar não deve
                nem ver os campos que não vai preencher. Com uma modalidade só,
                não há o que escolher — mas a retirada ainda precisa dizer onde. */}
                {(modalidades.length > 1 || retirar) && (
                  <section className="border-t pt-4" style={{ borderColor: paleta.linha }}>
                    <h2 className="px-4 pb-2 text-base font-bold">
                      {modalidades.length > 1 ? 'Como você quer receber' : 'Retirada na loja'}
                    </h2>
                    {modalidades.length > 1 &&
                      (
                        [
                          { valor: 'ENTREGA', titulo: 'Entrega', detalhe: 'Levamos até você.' },
                          {
                            valor: 'RETIRADA',
                            titulo: 'Retirar na loja',
                            detalhe: 'Sem taxa de entrega.',
                          },
                        ] as const
                      ).map((opcao) => (
                        <label
                          key={opcao.valor}
                          className="flex items-center gap-3 border-b px-4 py-3 text-sm"
                          style={{ borderColor: paleta.linha }}
                        >
                          <input
                            type="radio"
                            name="recebimento"
                            className="size-4"
                            style={{ accentColor: marca.corDeAcao }}
                            checked={modalidade === opcao.valor}
                            onChange={() => setModalidade(opcao.valor)}
                          />
                          <span>
                            {opcao.titulo}
                            <span className="block text-xs" style={{ color: paleta.suave }}>
                              {opcao.detalhe}
                            </span>
                          </span>
                        </label>
                      ))}

                    <AnimatePresence initial={false}>
                      {retirar && (
                        <m.p
                          key="retire"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                          className="overflow-hidden px-4 text-sm"
                        >
                          <span className="block pt-3">
                            {enderecoDeRetirada ? (
                              <>
                                Retire em{' '}
                                <strong>
                                  {enderecoDeRetirada.rua}, {enderecoDeRetirada.numero}
                                  {enderecoDeRetirada.complemento &&
                                    ` — ${enderecoDeRetirada.complemento}`}
                                </strong>
                                <span className="block text-xs" style={{ color: paleta.suave }}>
                                  {[enderecoDeRetirada.bairro, enderecoDeRetirada.cidade]
                                    .filter(Boolean)
                                    .join(', ')}
                                  /{enderecoDeRetirada.estado}
                                </span>
                              </>
                            ) : (
                              'Retire na loja.'
                            )}
                            {operacao.retirada.instrucoes && (
                              <span className="mt-1 block text-xs">
                                {operacao.retirada.instrucoes}
                              </span>
                            )}
                          </span>
                        </m.p>
                      )}
                    </AnimatePresence>
                  </section>
                )}

                {/* Quando: só aparece se der para agendar. Sem agendamento, o
                    pedido é para agora, e perguntar seria uma escolha falsa. */}
                {podeAgendar && (
                  <section className="border-t pt-4" style={{ borderColor: paleta.linha }}>
                    <h2 className="px-4 pb-2 text-base font-bold">Quando</h2>
                    <label
                      className="flex items-start gap-3 border-b px-4 py-3 text-sm"
                      style={{ borderColor: paleta.linha, opacity: situacao.aberta ? 1 : 0.55 }}
                    >
                      <input
                        type="radio"
                        name="quando"
                        className="mt-0.5 size-4"
                        style={{ accentColor: marca.corDeAcao }}
                        checked={quando === 'AGORA'}
                        disabled={!situacao.aberta}
                        onChange={() => {
                          setQuando('AGORA');
                          setAviso(null);
                        }}
                      />
                      <span>
                        Agora
                        <span className="block text-xs" style={{ color: paleta.suave }}>
                          {!situacao.aberta
                            ? situacao.texto
                            : retirar
                              ? `Pronto em ${textoDoTempo(operacao, 'RETIRADA')}`
                              : `Chega em ${textoDoTempo(operacao, 'ENTREGA')}`}
                        </span>
                      </span>
                    </label>
                    <label
                      className="flex items-start gap-3 border-b px-4 py-3 text-sm"
                      style={{ borderColor: paleta.linha }}
                    >
                      <input
                        type="radio"
                        name="quando"
                        className="mt-0.5 size-4"
                        style={{ accentColor: marca.corDeAcao }}
                        checked={quando === 'AGENDAR'}
                        onChange={() => {
                          setQuando('AGENDAR');
                          setAviso(null);
                        }}
                      />
                      <span>
                        Agendar
                        <span className="block text-xs" style={{ color: paleta.suave }}>
                          {retirar ? 'Escolha a hora de buscar.' : 'Escolha quando quer receber.'}
                        </span>
                      </span>
                    </label>

                    <AnimatePresence initial={false}>
                      {quando === 'AGENDAR' && dia && (
                        <m.div
                          key="agenda"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 px-4 pt-3">
                            {/* Os dias numa fileira que rola de lado: sete
                                botões não cabem na largura do celular. */}
                            <div
                              role="radiogroup"
                              aria-label="Dia"
                              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
                            >
                              {dias.map((item) => {
                                const escolhido = item.data === dia.data;
                                return (
                                  <button
                                    key={item.data}
                                    type="button"
                                    role="radio"
                                    aria-checked={escolhido}
                                    onClick={() => {
                                      setDia(item.data);
                                      setHorario(null);
                                      setAviso(null);
                                    }}
                                    className="shrink-0 rounded-full border px-3 py-1.5 text-sm"
                                    style={
                                      escolhido
                                        ? {
                                            backgroundColor: marca.corDeAcao,
                                            borderColor: marca.corDeAcao,
                                            color: textoSobre(marca.corDeAcao),
                                          }
                                        : { borderColor: paleta.linha }
                                    }
                                  >
                                    {rotuloDoDiaComData(item.data, new Date(instante))}
                                  </button>
                                );
                              })}
                            </div>
                            <div>
                              <label htmlFor="horario" className="mb-1 block text-xs font-medium">
                                {retirar ? 'Hora de buscar' : 'Janela de entrega'}
                              </label>
                              <select
                                id="horario"
                                value={horario?.getTime() ?? ''}
                                onChange={(evento) => {
                                  setHorario(Number(evento.target.value));
                                  setAviso(null);
                                }}
                                className="h-11 w-full rounded-lg border px-3 text-sm"
                                style={campo}
                              >
                                {dia.horarios.map((opcao) => (
                                  <option key={opcao.getTime()} value={opcao.getTime()}>
                                    {rotuloDaJanela(opcao, dia.data)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </section>
                )}

                {/*
                 * Campos SEPARADOS, e não uma caixa de "endereço".
                 *
                 * É o formato que o cadastro de clientes do painel exige
                 * (`CompanyCustomerAddress`). Pedir tudo numa linha só deixaria a
                 * loja sem como salvar este cliente sem redigitar — que é a
                 * funcionalidade inteira indo embora por causa de um campo.
                 */}
                {/* Logo abaixo da escolha, para causa e efeito ficarem
                    lado a lado: tocou em "retirar", o endereço recolhe ali
                    mesmo. Os valores ficam guardados no estado da página, então
                    voltar para entrega traz tudo de volta como estava. */}
                <AnimatePresence initial={false}>
                  {!retirar && (
                    <m.section
                      key="endereco"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 border-t pt-4" style={{ borderColor: paleta.linha }}>
                        <h2 className="px-4 pb-2 text-base font-bold">Endereço de entrega</h2>
                        <div className="space-y-3 px-4">
                          <div className="grid grid-cols-2 gap-3">
                            <Campo
                              id="rua"
                              rotulo="Rua"
                              valor={entrega.rua}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, rua: v }))}
                              estilo={campo}
                              paleta={paleta}
                              className="col-span-2"
                            />
                            <Campo
                              id="numero"
                              rotulo="Número"
                              valor={entrega.numero}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, numero: v }))}
                              estilo={campo}
                              paleta={paleta}
                            />
                            <Campo
                              id="complemento"
                              rotulo="Complemento"
                              valor={entrega.complemento ?? ''}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, complemento: v || null }))}
                              estilo={campo}
                              paleta={paleta}
                            />
                            {/* Lista, e não campo livre: o bairro define a taxa e
                          delimita a área que a loja atende. */}
                            <div className="col-span-2">
                              <label htmlFor="bairro" className="mb-1 block text-xs font-medium">
                                Bairro
                              </label>
                              <select
                                id="bairro"
                                value={entrega.bairro}
                                onChange={(evento) =>
                                  setEntrega((e) => ({ ...e, bairro: evento.target.value }))
                                }
                                className="h-11 w-full rounded-lg border px-3 text-sm"
                                style={campo}
                              >
                                <option value="">Escolha o bairro</option>
                                {bairros.map((bairro) => (
                                  <option key={bairro.id} value={bairro.nome}>
                                    {bairro.nome} — {moeda(bairro.taxa)}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-xs" style={{ color: paleta.suave }}>
                                {bairros.length === 0
                                  ? 'Esta loja ainda não cadastrou bairros de entrega.'
                                  : 'Não achou o seu? A loja não entrega nele por enquanto.'}
                              </p>
                            </div>

                            <Campo
                              id="cidade"
                              rotulo="Cidade"
                              valor={entrega.cidade}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, cidade: v }))}
                              estilo={campo}
                              paleta={paleta}
                            />
                            <Campo
                              id="estado"
                              rotulo="Estado"
                              valor={entrega.estado}
                              aoMudar={(v) =>
                                setEntrega((e) => ({ ...e, estado: v.toUpperCase().slice(0, 2) }))
                              }
                              estilo={campo}
                              paleta={paleta}
                            />
                            <Campo
                              id="cep"
                              rotulo="CEP"
                              valor={entrega.cep}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, cep: v }))}
                              estilo={campo}
                              paleta={paleta}
                              inputMode="numeric"
                              className="col-span-2"
                            />
                            <Campo
                              id="referencia"
                              rotulo="Ponto de referência"
                              valor={entrega.referencia ?? ''}
                              aoMudar={(v) => setEntrega((e) => ({ ...e, referencia: v || null }))}
                              estilo={campo}
                              paleta={paleta}
                              dica="Portão, cor da casa, o que ajudar a achar."
                              className="col-span-2"
                            />
                          </div>
                        </div>
                      </div>
                    </m.section>
                  )}
                </AnimatePresence>

                <section className="mt-4 border-t pt-4" style={{ borderColor: paleta.linha }}>
                  <h2 className="px-4 pb-2 text-base font-bold">Pagamento</h2>
                  {(['ONLINE', 'ENTREGA'] as const).map((grupo) => {
                    const doGrupo = FORMAS_DE_PAGAMENTO.filter(
                      (forma) => forma.grupo === grupo && oferecidas.includes(forma.valor),
                    );
                    // Grupo sem forma nenhuma não aparece: um título sem opções
                    // embaixo faria o cliente procurar o que não existe.
                    if (doGrupo.length === 0) return null;

                    return (
                      <div
                        key={grupo}
                        role="radiogroup"
                        aria-label={GRUPOS_DE_PAGAMENTO[grupo].titulo}
                      >
                        <p
                          className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase"
                          style={{ color: paleta.suave }}
                        >
                          {GRUPOS_DE_PAGAMENTO[grupo].titulo}
                        </p>
                        {doGrupo.map((forma) => (
                          <label
                            key={forma.valor}
                            className="flex items-start gap-3 border-b px-4 py-3 text-sm"
                            style={{ borderColor: paleta.linha }}
                          >
                            <input
                              type="radio"
                              name="pagamento"
                              className="mt-0.5 size-4"
                              style={{ accentColor: marca.corDeAcao }}
                              checked={pagamento === forma.valor}
                              onChange={() => setPagamento(forma.valor)}
                            />
                            <span>
                              {forma.titulo}
                              <span className="block text-xs" style={{ color: paleta.suave }}>
                                {forma.detalhe}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })}

                  {/* Nenhum campo de cartão nesta tela, de propósito: crédito e
                      débito online são digitados na página do Asaas. Nesta
                      demonstração não há Asaas por trás, e a tela diz isso em
                      vez de fingir uma cobrança. */}
                  <AnimatePresence initial={false}>
                    {pagaOnline && (
                      <m.p
                        key="aviso-online"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                        className="overflow-hidden px-4 text-xs"
                        style={{ color: paleta.suave }}
                      >
                        <span className="block pt-3">
                          Na versão final, ao confirmar você vai para a página segura do Asaas para
                          pagar. Nesta demonstração o pedido é registrado direto, sem cobrança.
                        </span>
                      </m.p>
                    )}
                  </AnimatePresence>

                  {/* O que o cliente escreve tem que caber em algum lugar, senão
                      vira ligação para a loja — ou pedido errado. */}
                  <div className="px-4 pt-3">
                    <label htmlFor="observacao" className="mb-1 block text-xs font-medium">
                      Alguma observação?
                    </label>
                    <textarea
                      id="observacao"
                      value={observacao}
                      onChange={(evento) => setObservacao(evento.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="Sem cebola, troca o refri por suco, apartamento no fundo…"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={campo}
                    />
                  </div>

                  {/* Troco perguntado aqui, e não na porta: é o que o motoboy
                      precisa levar na mão, e ele sai antes de alguém ligar. */}
                  <AnimatePresence initial={false}>
                    {emDinheiro && (
                      <m.div
                        key="troco"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                        className="overflow-hidden px-4"
                      >
                        <div className="pt-3">
                          <Campo
                            id="troco"
                            rotulo="Precisa de troco para quanto?"
                            valor={trocoPara}
                            aoMudar={setTrocoPara}
                            estilo={campo}
                            paleta={paleta}
                            inputMode="decimal"
                            dica="Deixe em branco se tiver o valor certo."
                          />
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </section>
              </>
            )}
          </>
        )}
      </div>

      {itens.length > 0 && usuarioId !== null && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t p-3"
          style={{ backgroundColor: paleta.fundo, borderColor: paleta.linha }}
        >
          <div className="mx-auto max-w-lg">
            {/* O mínimo vem antes do resto: não adianta a pessoa preencher o
                endereço inteiro para descobrir no fim que falta R$ 9,00. */}
            {/* O aviso entra e sai recolhendo, em vez de aparecer de uma vez:
                sem isso o botão pula para cima ou para baixo justamente quando
                o polegar está indo nele. */}
            <AnimatePresence initial={false} mode="popLayout">
              {aviso ? (
                <m.p
                  key="aviso"
                  role="alert"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                  className="overflow-hidden text-xs font-medium"
                >
                  <span className="block pb-2">{aviso}</span>
                </m.p>
              ) : faltaParaOMinimo > 0 ? (
                <m.p
                  key="minimo"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                  className="overflow-hidden text-xs font-medium"
                >
                  <span className="block pb-2">
                    Pedido mínimo de {moeda(minimo ?? 0)} em itens para entrega. Faltam{' '}
                    {moeda(faltaParaOMinimo)}.
                  </span>
                </m.p>
              ) : faltando.length > 0 ? (
                <m.p
                  key="faltando"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                  className="overflow-hidden text-xs"
                  style={{ color: paleta.suave }}
                >
                  <span className="block pb-2">Falta preencher: {faltando.join(', ')}.</span>
                </m.p>
              ) : null}
            </AnimatePresence>
            <button
              type="button"
              disabled={enviando || indisponivel || faltando.length > 0 || faltaParaOMinimo > 0}
              onClick={confirmar}
              className="flex h-13 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold transition-opacity duration-200 disabled:opacity-40"
              style={{ backgroundColor: marca.corDeAcao, color: textoSobre(marca.corDeAcao) }}
            >
              <span>
                {enviando
                  ? 'Enviando...'
                  : modalidades.length === 0
                    ? 'A loja não está recebendo pedidos'
                    : quando === 'AGORA' && !situacao.aberta
                      ? situacao.texto
                      : pagaOnline
                        ? 'Ir para o pagamento'
                        : quando === 'AGENDAR'
                          ? 'Agendar pedido'
                          : 'Fazer pedido'}
              </span>
              <span>{moeda(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  estilo,
  paleta,
  dica,
  inputMode,
  className,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  estilo: React.CSSProperties;
  paleta: { suave: string };
  dica?: string;
  inputMode?: 'tel' | 'numeric' | 'decimal';
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        inputMode={inputMode}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="h-11 w-full rounded-lg border px-3 text-sm"
        style={estilo}
      />
      {dica && (
        <p className="mt-1 text-xs" style={{ color: paleta.suave }}>
          {dica}
        </p>
      )}
    </div>
  );
}
