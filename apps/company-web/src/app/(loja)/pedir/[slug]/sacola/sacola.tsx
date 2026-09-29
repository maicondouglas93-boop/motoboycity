'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@motoboycity/api-client';
import type { CupomPublico } from '@motoboycity/types';
import { emCentavos, emReais } from '@motoboycity/validation';
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
import { cupomNaSacola, precificarSacola } from '@/lib/loja-promocoes';
import { EsqueletoDoCheckout } from '@/components/loja-online/esqueleto-do-checkout';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import { SeloDePromocao } from '@/components/loja-online/selo-de-promocao';
import { CupomDoCheckout } from '@/components/loja-online/cupom-do-checkout';
import {
  ajustarQuantidade,
  apelidoSugerido,
  clienteSalvo,
  comEnderecoDoPedido,
  enderecosDaConta,
  guardarCliente,
  guardarEnderecos,
  guardarPedido,
  mesmoEndereco,
  proximoNumero,
  removerEndereco,
  useHidratado,
  useSacola,
  type EnderecoSalvo,
} from '@/components/loja-online/armazenamento';
import {
  Campo,
  CampoDeLista,
  CampoDeTexto,
  OpcaoDaLista,
  Secao,
  Segmentado,
} from '@/components/loja-online/campos-do-checkout';
import { PorteiraDeLogin, useConta } from '@/components/loja-online/conta';
import { EnderecosSalvos, NomeDoEndereco } from '@/components/loja-online/enderecos-do-checkout';
import estilos from '@/components/loja-online/loja.module.css';
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

type CampoDoCheckout =
  'nome' | 'telefone' | 'cpf' | 'rua' | 'numero' | 'bairro' | 'cidade' | 'estado' | 'cep';

/** A ordem em que os campos aparecem: o primeiro com erro é o que recebe o foco. */
const ORDEM_DOS_CAMPOS: readonly CampoDoCheckout[] = [
  'rua',
  'numero',
  'bairro',
  'cidade',
  'estado',
  'cep',
  'nome',
  'telefone',
  'cpf',
];

/**
 * O que o CLIENTE lê em cada forma de pagamento.
 *
 * `FORMAS_DE_PAGAMENTO` serve também às Configurações, onde quem lê é a loja —
 * "O cliente informa para quanto precisa de troco" fala com ela, e aparecia
 * aqui, para o próprio cliente. O grupo já diz "na entrega" ou "online", então
 * o título não repete: "Crédito", e não "Crédito na maquininha".
 */
const TEXTO_NA_SACOLA: Record<FormaDePagamento, { titulo: string; detalhe: string | null }> = {
  PIX_ONLINE: {
    titulo: 'Pix',
    detalhe: 'O QR Code aparece logo depois do pedido. A loja só o recebe depois que você paga.',
  },
  PIX_DIRETO: {
    titulo: 'Pix',
    detalhe:
      'O QR Code aparece logo depois do pedido. Depois de pagar, envie o comprovante pelo WhatsApp da loja.',
  },
  CREDITO_ONLINE: {
    titulo: 'Cartão de crédito',
    detalhe: 'Você digita o cartão na página segura do Asaas, não aqui.',
  },
  DEBITO_ONLINE: {
    titulo: 'Cartão de débito',
    detalhe: 'Você digita o cartão na página segura do Asaas, não aqui.',
  },
  DINHEIRO: { titulo: 'Dinheiro', detalhe: null },
  PIX_MAQUININHA: { titulo: 'Pix', detalhe: 'QR Code na maquininha, na hora de receber.' },
  CREDITO_MAQUININHA: { titulo: 'Crédito', detalhe: 'Passado na maquininha, ao receber.' },
  DEBITO_MAQUININHA: { titulo: 'Débito', detalhe: 'Passado na maquininha, ao receber.' },
};

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
    return <EsqueletoDoCheckout paleta={paleta} corDaMarca={marca.corDaMarca} />;
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
  // Sem endereço salvo, a cidade e a UF nascem as da loja: ela entrega por
  // bairro da própria lista, então é na cidade dela. Digitadas à mão, um erro ali
  // passava batido e a corrida saía com a distância — e o preço — de outra cidade.
  const daLoja = cardapio.operacao ? cardapio.enderecoDeRetirada : null;
  const enderecoNovo = (): EnderecoDaEntrega => ({
    ...ENDERECO_VAZIO,
    cidade: daLoja?.cidade ?? '',
    estado: daLoja?.estado ?? '',
  });
  const [entrega, setEntrega] = useState<EnderecoDaEntrega>(anterior?.entrega ?? enderecoNovo());

  /*
   * Os endereços da conta (casa, trabalho...) e qual deles este pedido usa;
   * `null` é um endereço digitado agora. O formulário abaixo é o mesmo nos dois
   * casos: escolher um da lista só o preenche.
   */
  const [enderecos, setEnderecos] = useState<EnderecoSalvo[]>(() => enderecosDaConta(anterior));
  const ultimoUsado = enderecos.find((salvo) =>
    mesmoEndereco(salvo.endereco, anterior?.entrega ?? null),
  );
  const [escolhido, setEscolhido] = useState<string | null>(ultimoUsado?.id ?? null);
  const [editando, setEditando] = useState(false);
  const [apelido, setApelido] = useState(ultimoUsado?.apelido ?? apelidoSugerido(enderecos));
  const [salvarEndereco, setSalvarEndereco] = useState(true);
  // A loja de verdade oferece o que gravou (o servidor já tirou as online sem
  // conta Asaas); a demonstração, as do exemplo.
  const oferecidas = cardapio.operacao?.pagamentos ?? formasOferecidas(loja);
  const bairros = cardapio.operacao?.bairros ?? loja.bairros;
  const [pagamento, setPagamento] = useState<FormaDePagamento>(oferecidas[0] ?? 'DINHEIRO');
  const [trocoPara, setTrocoPara] = useState('');
  // Só no Pix: o Asaas não cria a cobrança sem o CPF de quem paga.
  const [cpf, setCpf] = useState('');
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
  // O cupom que o servidor conferiu para esta sacola. Só a loja de verdade tem.
  const [cupom, setCupom] = useState<CupomPublico | null>(null);
  // Só depois de tocar em "Fazer pedido" com algo faltando os erros aparecem:
  // mostrar "informe o nome" num campo que a pessoa ainda nem chegou a ver é ruído.
  const [tentou, setTentou] = useState(false);

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

  // Os itens com as promoções, pela mesma regra que o servidor usa no pedido: o
  // `totalVisto` que vai na chamada é exatamente este, e o servidor recusa se não bater.
  const sacola = useMemo(
    () => precificarSacola(itens, cardapio.produtos, cardapio.promocoes, instante),
    [itens, cardapio.produtos, cardapio.promocoes, instante],
  );
  const subtotal = sacola.subtotal;
  // O cupom sobre os itens que ele alcança (só os sem promoção, salvo o cupom que diz o
  // contrário). Se a sacola de agora não o serve, o desconto é zero e a tela diz por quê.
  const doCupom = cupomNaSacola(sacola, cupom);
  const descontoDoCupom = doCupom.desconto;
  // Retirada não tem entrega, logo não tem taxa: o cliente busca no balcão.
  const taxa = retirar ? 0 : (bairroEscolhido?.taxa ?? 0);
  const total = emReais(emCentavos(subtotal) - emCentavos(descontoDoCupom) + emCentavos(taxa));
  const emDinheiro = pagamento === 'DINHEIRO';
  // "Online" aqui é o que passa pelo Asaas: pede CPF e leva à cobrança. O Pix
  // direto também é pagar agora, mas o pedido sai na hora e o cliente paga na
  // chave da loja, com o comprovante indo pelo WhatsApp.
  const pagaOnline = pagamento !== 'PIX_DIRETO' && descricaoDaForma(pagamento).grupo === 'ONLINE';
  // A loja de exemplo não cobra nada; o CPF só vale na de verdade.
  const pedeCpf = pagaOnline && cardapio.operacao !== null;

  // O mínimo conta só os itens: somar a entrega faria a taxa ajudar a atingir
  // o mínimo, que é o contrário do que o mínimo existe para proteger. E vale só
  // na entrega — na retirada não há taxa para proteger.
  const minimo = pedidoMinimoDa(operacao, modalidade);
  const faltaParaOMinimo = minimo !== null && subtotal < minimo ? minimo - subtotal : 0;

  /*
   * O que falta, campo por campo. O botão de enviar NÃO fica desabilitado por
   * isso: desabilitado, ele não diz o que falta, e quem não acha o campo
   * desiste. Ao tocar nele com algo faltando, cada campo mostra o seu erro e o
   * primeiro recebe o foco.
   */
  const erros: Partial<Record<CampoDoCheckout, string>> = {};
  if (nome.trim() === '') erros.nome = 'Informe seu nome.';
  if (telefone.replace(/\D/g, '').length < 10) erros.telefone = 'Informe o telefone com DDD.';
  if (pedeCpf && cpf.replace(/\D/g, '').length !== 11) {
    erros.cpf = 'Informe o CPF de quem paga o Pix.';
  }
  // Na retirada o endereço não é pedido, então também não pode ser exigido.
  if (!retirar) {
    if (entrega.rua.trim() === '') erros.rua = 'Informe a rua.';
    if (entrega.numero.trim() === '') erros.numero = 'Informe o número.';
    if (bairroEscolhido === null) erros.bairro = 'Escolha o bairro.';
    if (entrega.cidade.trim() === '') erros.cidade = 'Informe a cidade.';
    if (entrega.estado.trim().length !== 2) erros.estado = 'Use a sigla, como MG.';
    // Em branco vale o CEP da loja; digitado, tem que estar completo.
    if (!/^(\d{5}-?\d{3})?$/.test(entrega.cep.trim())) erros.cep = 'Use 8 dígitos.';
  }
  const temErro = Object.keys(erros).length > 0;
  const erroDe = (campo: CampoDoCheckout) => (tentou ? erros[campo] : undefined);

  /*
   * O formulário fica recolhido enquanto o endereço escolhido da lista está bom.
   * Abre sozinho se ele não serve mais — o bairro saiu da lista da loja, um
   * campo veio vazio —, para o erro ter onde aparecer.
   */
  const CAMPOS_DO_ENDERECO: CampoDoCheckout[] = [
    'rua',
    'numero',
    'bairro',
    'cidade',
    'estado',
    'cep',
  ];
  const enderecoComProblema = CAMPOS_DO_ENDERECO.some((campo) => erros[campo]);
  const formularioAberto = escolhido === null || editando || enderecoComProblema;

  function escolherEndereco(id: string | null, lista: EnderecoSalvo[] = enderecos) {
    const salvo = lista.find((item) => item.id === id);
    setEscolhido(salvo ? salvo.id : null);
    setEditando(false);
    if (salvo) {
      setEntrega(salvo.endereco);
      setApelido(salvo.apelido);
    } else {
      setEntrega(enderecoNovo());
      setApelido(apelidoSugerido(lista));
      setSalvarEndereco(true);
    }
  }

  function apagarEndereco(id: string) {
    if (usuarioId === null) return;
    const restantes = removerEndereco(slug, usuarioId, id);
    setEnderecos(restantes);
    escolherEndereco(restantes[0]?.id ?? null, restantes);
  }

  /** Depois do pedido feito: guarda o endereço novo, ou as edições do que foi usado. */
  function guardarOsEnderecos(conta: string) {
    if (retirar) return;
    guardarEnderecos(
      slug,
      conta,
      comEnderecoDoPedido(enderecos, {
        escolhidoId: escolhido,
        endereco: entrega,
        apelido,
        salvar: salvarEndereco,
      }),
    );
  }

  function alterarQuantidade(indice: number, passo: number) {
    setItens((atual) => ajustarQuantidade(atual, indice, passo));
  }

  function confirmar() {
    if (usuarioId === null) return;

    if (temErro) {
      setTentou(true);
      setAviso(null);
      const primeiro = ORDEM_DOS_CAMPOS.find((campo) => erros[campo]);
      const elemento = primeiro ? document.getElementById(primeiro) : null;
      elemento?.scrollIntoView?.({ block: 'center' });
      elemento?.focus({ preventScroll: true });
      return;
    }

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
    guardarOsEnderecos(usuarioId);

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
      itens: itens.map((item, indice) => ({
        nome: item.nome,
        quantidade: item.quantidade,
        tamanho: item.tamanho,
        escolhas: item.escolhas,
        total: sacola.linhas[indice]?.total ?? item.unitario * item.quantidade,
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
        cpf: pedeCpf ? cpf.replace(/\D/g, '') : null,
        // O cupom que não vale para a sacola de agora não vai: o total visto é sem ele.
        cupom: cupom && doCupom.recusa === null ? cupom.codigo : null,
      });
      guardarCliente(slug, conta, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        entrega: retirar ? null : entrega,
      });
      guardarOsEnderecos(conta);
      setItens([]);
      router.push(`/pedir/${slug}/pedidos?novo=${pedido.numero}`);
    } catch (erro) {
      // O servidor recusou o cupom (venceu, acabou, já foi usado): ele sai da sacola, e o
      // cliente pode fazer o pedido sem ele, com a mensagem dizendo o motivo.
      if (erro instanceof ApiError && erro.body?.code?.startsWith('STORE_COUPON_')) setCupom(null);
      setAviso(motivoDaRecusa(erro));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="min-h-dvh"
      style={
        {
          backgroundColor: paleta.fundo,
          color: paleta.texto,
          '--foco': paleta.texto,
        } as CSSProperties
      }
    >
      <div className="h-1" style={{ backgroundColor: marca.corDaMarca }} />

      <div className={`${estilos['entradaDaPagina']} mx-auto w-full max-w-lg pb-32`}>
        <header
          className="flex items-center gap-1 border-b px-2 py-2"
          style={{ borderColor: paleta.linha }}
        >
          <Link
            href={`/pedir/${slug}`}
            aria-label="Voltar ao cardápio"
            className={`${estilos['foco']} flex size-10 items-center justify-center rounded-lg`}
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-lg font-semibold">Finalizar pedido</h1>
        </header>

        {itens.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm" style={{ color: paleta.suave }}>
              Sua sacola está vazia.
            </p>
            <Link
              href={`/pedir/${slug}`}
              className={`${estilos['foco']} mt-4 inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold`}
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
                    <p className="text-base font-medium">
                      {item.nome}
                      {item.tamanho && ` · ${item.tamanho}`}
                    </p>
                    {item.escolhas.length > 0 && (
                      <p className="mt-0.5 text-sm" style={{ color: paleta.suave }}>
                        {item.escolhas.join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {sacola.linhas[indice]?.promocao && (
                        <s className="mr-1.5 text-sm font-normal" style={{ color: paleta.suave }}>
                          {moeda(sacola.linhas[indice]?.original ?? 0)}
                        </s>
                      )}
                      {moeda(sacola.linhas[indice]?.total ?? item.unitario * item.quantidade)}
                    </p>
                    {sacola.linhas[indice]?.promocao && (
                      <p className="mt-1">
                        <SeloDePromocao
                          rotulo={sacola.linhas[indice].promocao.rotulo}
                          corDeAcao={marca.corDeAcao}
                        />
                      </p>
                    )}
                  </div>

                  <div
                    className="flex shrink-0 items-center rounded-lg border"
                    style={{ borderColor: paleta.contorno }}
                  >
                    <button
                      type="button"
                      aria-label={`Menos um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, -1)}
                      className={`${estilos['foco']} flex size-10 items-center justify-center rounded-lg`}
                    >
                      {item.quantidade === 1 ? (
                        <Trash2 className="size-4" />
                      ) : (
                        <Minus className="size-4" />
                      )}
                    </button>
                    <span className="w-6 text-center text-sm font-medium tabular-nums">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      aria-label={`Mais um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, 1)}
                      className={`${estilos['foco']} flex size-10 items-center justify-center rounded-lg`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}

              {cardapio.operacao !== null && usuarioId !== null && (
                <CupomDoCheckout
                  slug={slug}
                  itens={itens}
                  aplicado={cupom}
                  recusa={doCupom.recusa}
                  paleta={paleta}
                  corDaMarca={marca.corDaMarca}
                  corDeAcao={marca.corDeAcao}
                  aoAplicar={setCupom}
                  aoRemover={() => setCupom(null)}
                />
              )}

              <div className="space-y-1.5 px-4 py-4 text-sm tabular-nums">
                <div className="flex justify-between" style={{ color: paleta.suave }}>
                  <span>Itens</span>
                  <span>{moeda(subtotal + sacola.economia)}</span>
                </div>
                {sacola.economia > 0 && (
                  <div
                    className="flex justify-between font-medium"
                    style={{ color: marca.corDaMarca }}
                  >
                    <span>Promoções</span>
                    <span>− {moeda(sacola.economia)}</span>
                  </div>
                )}
                {descontoDoCupom > 0 && cupom && (
                  <div
                    className="flex justify-between font-medium"
                    style={{ color: marca.corDaMarca }}
                  >
                    <span>Cupom {cupom.codigo}</span>
                    <span>− {moeda(descontoDoCupom)}</span>
                  </div>
                )}
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
                {/*
                 * Receber: a escolha e, logo abaixo dela, o que essa escolha
                 * pede — tocou em "retirar", o endereço recolhe ali mesmo. Os
                 * valores ficam guardados no estado da página, então voltar
                 * para entrega traz tudo de volta como estava.
                 *
                 * Campos SEPARADOS, e não uma caixa de "endereço": é o formato
                 * que o cadastro de clientes do painel exige
                 * (`CompanyCustomerAddress`). Pedir tudo numa linha só deixaria
                 * a loja sem como salvar este cliente sem redigitar.
                 */}
                <Secao
                  titulo={
                    modalidades.length > 1
                      ? 'Como você quer receber'
                      : retirar
                        ? 'Retirada na loja'
                        : 'Endereço de entrega'
                  }
                  paleta={paleta}
                >
                  {modalidades.length > 1 && (
                    <Segmentado
                      nome="recebimento"
                      rotulo="Como você quer receber"
                      valor={modalidade}
                      aoMudar={setModalidade}
                      opcoes={[
                        { valor: 'ENTREGA', titulo: 'Entrega', detalhe: 'Levamos até você.' },
                        {
                          valor: 'RETIRADA',
                          titulo: 'Retirar na loja',
                          detalhe: 'Sem taxa de entrega.',
                        },
                      ]}
                      paleta={paleta}
                    />
                  )}

                  <AnimatePresence initial={false}>
                    {retirar && (
                      <m.div
                        key="retire"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                        className="overflow-hidden"
                      >
                        <p className={`text-sm ${modalidades.length > 1 ? 'pt-4' : ''}`}>
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
                        </p>
                      </m.div>
                    )}

                    {!retirar && (
                      <m.div
                        key="endereco"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                        className="overflow-hidden"
                      >
                        <div className={`space-y-4 ${modalidades.length > 1 ? 'pt-4' : ''}`}>
                          {enderecos.length > 0 && (
                            <EnderecosSalvos
                              enderecos={enderecos}
                              escolhido={escolhido}
                              bairrosDaLoja={bairros.map((bairro) => bairro.nome)}
                              aoEscolher={(id) => escolherEndereco(id)}
                              aoEditar={() => setEditando(true)}
                              aoApagar={apagarEndereco}
                              paleta={paleta}
                            />
                          )}
                          {formularioAberto && (
                            <div className="space-y-3">
                              <Campo
                                id="rua"
                                rotulo="Rua"
                                valor={entrega.rua}
                                aoMudar={(v) => setEntrega((e) => ({ ...e, rua: v }))}
                                paleta={paleta}
                                erro={erroDe('rua')}
                                autoComplete="address-line1"
                              />
                              <div className="grid grid-cols-2 gap-3">
                                <Campo
                                  id="numero"
                                  rotulo="Número"
                                  valor={entrega.numero}
                                  aoMudar={(v) => setEntrega((e) => ({ ...e, numero: v }))}
                                  paleta={paleta}
                                  erro={erroDe('numero')}
                                />
                                <Campo
                                  id="complemento"
                                  rotulo="Complemento"
                                  valor={entrega.complemento ?? ''}
                                  aoMudar={(v) =>
                                    setEntrega((e) => ({ ...e, complemento: v || null }))
                                  }
                                  paleta={paleta}
                                  autoComplete="address-line2"
                                />
                              </div>
                              {/* Lista, e não campo livre: o bairro define a taxa e
                              delimita a área que a loja atende. */}
                              <CampoDeLista
                                id="bairro"
                                rotulo="Bairro"
                                valor={entrega.bairro}
                                aoMudar={(v) => setEntrega((e) => ({ ...e, bairro: v }))}
                                paleta={paleta}
                                erro={erroDe('bairro')}
                                dica={
                                  bairros.length === 0
                                    ? 'Esta loja ainda não cadastrou bairros de entrega.'
                                    : 'Não achou o seu? A loja não entrega nele por enquanto.'
                                }
                              >
                                <option value="">Escolha o bairro</option>
                                {bairros.map((bairro) => (
                                  <option key={bairro.id} value={bairro.nome}>
                                    {bairro.nome} — {moeda(bairro.taxa)}
                                  </option>
                                ))}
                              </CampoDeLista>
                              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_7rem] gap-3">
                                <Campo
                                  id="cidade"
                                  rotulo="Cidade"
                                  valor={entrega.cidade}
                                  aoMudar={(v) => setEntrega((e) => ({ ...e, cidade: v }))}
                                  paleta={paleta}
                                  erro={erroDe('cidade')}
                                  autoComplete="address-level2"
                                />
                                <Campo
                                  id="estado"
                                  rotulo="UF"
                                  valor={entrega.estado}
                                  aoMudar={(v) =>
                                    setEntrega((e) => ({
                                      ...e,
                                      estado: v.toUpperCase().slice(0, 2),
                                    }))
                                  }
                                  paleta={paleta}
                                  erro={erroDe('estado')}
                                  autoComplete="address-level1"
                                  maxLength={2}
                                />
                                <Campo
                                  id="cep"
                                  rotulo="CEP"
                                  valor={entrega.cep}
                                  aoMudar={(v) => setEntrega((e) => ({ ...e, cep: v }))}
                                  paleta={paleta}
                                  erro={erroDe('cep')}
                                  inputMode="numeric"
                                  autoComplete="postal-code"
                                />
                              </div>
                              <Campo
                                id="referencia"
                                rotulo="Ponto de referência"
                                valor={entrega.referencia ?? ''}
                                aoMudar={(v) =>
                                  setEntrega((e) => ({ ...e, referencia: v || null }))
                                }
                                paleta={paleta}
                                dica="Portão, cor da casa, o que ajudar a achar."
                              />
                              <NomeDoEndereco
                                novo={escolhido === null}
                                apelido={apelido}
                                aoMudarApelido={setApelido}
                                salvar={salvarEndereco}
                                aoMudarSalvar={setSalvarEndereco}
                                quantosGuardados={enderecos.length}
                                paleta={paleta}
                              />
                            </div>
                          )}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </Secao>

                {/* Quando: só aparece se der para agendar. Sem agendamento, o
                    pedido é para agora, e perguntar seria uma escolha falsa. */}
                {podeAgendar && (
                  <Secao titulo="Quando" paleta={paleta}>
                    <Segmentado
                      nome="quando"
                      rotulo="Quando"
                      valor={quando}
                      aoMudar={(valor) => {
                        setQuando(valor);
                        setAviso(null);
                      }}
                      opcoes={[
                        {
                          valor: 'AGORA',
                          titulo: 'Agora',
                          detalhe: !situacao.aberta
                            ? situacao.texto
                            : retirar
                              ? `Pronto em ${textoDoTempo(operacao, 'RETIRADA')}`
                              : `Chega em ${textoDoTempo(operacao, 'ENTREGA')}`,
                          desabilitada: !situacao.aberta,
                        },
                        {
                          valor: 'AGENDAR',
                          titulo: 'Agendar',
                          detalhe: retirar
                            ? 'Escolha a hora de buscar.'
                            : 'Escolha quando quer receber.',
                        },
                      ]}
                      paleta={paleta}
                    />

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
                          <div className="space-y-4 pt-4">
                            {/* Os dias numa fileira que rola de lado: sete
                                botões não cabem na largura do celular. */}
                            <div
                              role="radiogroup"
                              aria-label="Dia"
                              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                                    className={`${estilos['foco']} shrink-0 rounded-lg border px-3 py-2 text-sm`}
                                    style={
                                      escolhido
                                        ? {
                                            backgroundColor: marca.corDeAcao,
                                            borderColor: marca.corDeAcao,
                                            color: textoSobre(marca.corDeAcao),
                                          }
                                        : { borderColor: paleta.contorno }
                                    }
                                  >
                                    {rotuloDoDiaComData(item.data, new Date(instante))}
                                  </button>
                                );
                              })}
                            </div>
                            <CampoDeLista
                              id="horario"
                              rotulo={retirar ? 'Hora de buscar' : 'Janela de entrega'}
                              valor={horario?.getTime() ?? ''}
                              aoMudar={(v) => {
                                setHorario(Number(v));
                                setAviso(null);
                              }}
                              paleta={paleta}
                            >
                              {dia.horarios.map((opcao) => (
                                <option key={opcao.getTime()} value={opcao.getTime()}>
                                  {rotuloDaJanela(opcao, dia.data)}
                                </option>
                              ))}
                            </CampoDeLista>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </Secao>
                )}

                {/* Nome e telefone ficam FORA da parte que recolhe: são
                    obrigatórios também para retirar. */}
                <Secao titulo="Seus dados" paleta={paleta}>
                  <div className="space-y-3">
                    <Campo
                      id="nome"
                      rotulo="Seu nome"
                      valor={nome}
                      aoMudar={setNome}
                      paleta={paleta}
                      erro={erroDe('nome')}
                      autoComplete="name"
                    />
                    <Campo
                      id="telefone"
                      rotulo="Telefone"
                      valor={telefone}
                      aoMudar={setTelefone}
                      paleta={paleta}
                      erro={erroDe('telefone')}
                      inputMode="tel"
                      autoComplete="tel"
                      dica={
                        retirar
                          ? 'É por ele que a loja avisa se precisar falar com você.'
                          : 'É por ele que o motoboy liga se não achar o endereço.'
                      }
                    />
                  </div>
                  {/* A loja pode guardar o cliente no cadastro dela (decisão 19
                      do plano): quem compra fica sabendo antes de mandar. */}
                  <p className="mt-4 text-xs text-pretty" style={{ color: paleta.suave }}>
                    {retirar ? 'Nome e telefone vão' : 'Nome, telefone e endereço vão'} para a loja,
                    que pode guardá‑los no cadastro de clientes dela.
                  </p>
                </Secao>

                <Secao titulo="Pagamento" paleta={paleta}>
                  {(['ONLINE', 'ENTREGA'] as const).map((grupo) => {
                    const doGrupo = FORMAS_DE_PAGAMENTO.filter(
                      (forma) => forma.grupo === grupo && oferecidas.includes(forma.valor),
                    );
                    // Grupo sem forma nenhuma não aparece: um título sem opções
                    // embaixo faria o cliente procurar o que não existe.
                    if (doGrupo.length === 0) return null;
                    const tituloDoGrupo =
                      grupo === 'ENTREGA' && retirar
                        ? 'Pagar na retirada'
                        : GRUPOS_DE_PAGAMENTO[grupo].titulo;

                    return (
                      <div
                        key={grupo}
                        role="radiogroup"
                        aria-label={tituloDoGrupo}
                        className="mt-5 first:mt-0"
                      >
                        <p
                          className="mb-1 text-xs font-semibold tracking-wide uppercase"
                          style={{ color: paleta.suave }}
                        >
                          {tituloDoGrupo}
                        </p>
                        {doGrupo.map((forma, posicao) => {
                          const marcada = pagamento === forma.valor;
                          const texto = TEXTO_NA_SACOLA[forma.valor];
                          return (
                            <OpcaoDaLista
                              key={forma.valor}
                              nome="pagamento"
                              titulo={texto.titulo}
                              detalhe={texto.detalhe}
                              marcada={marcada}
                              aoMarcar={() => setPagamento(forma.valor)}
                              primeira={posicao === 0}
                              paleta={paleta}
                            >
                              {/* O que só vale para esta forma aparece logo
                                  abaixo dela, e não no fim da página: o troco é
                                  o que o motoboy leva na mão, e o CPF é do Pix. */}
                              <AnimatePresence initial={false}>
                                {marcada && forma.valor === 'DINHEIRO' && (
                                  <m.div
                                    key="troco"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pb-3 pl-7">
                                      <Campo
                                        id="troco"
                                        rotulo="Precisa de troco para quanto?"
                                        valor={trocoPara}
                                        aoMudar={setTrocoPara}
                                        paleta={paleta}
                                        inputMode="decimal"
                                        dica="Deixe em branco se tiver o valor certo."
                                      />
                                    </div>
                                  </m.div>
                                )}
                                {marcada && pedeCpf && forma.grupo === 'ONLINE' && (
                                  <m.div
                                    key="cpf"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pb-3 pl-7">
                                      <Campo
                                        id="cpf"
                                        rotulo="CPF de quem paga o Pix"
                                        valor={cpf}
                                        aoMudar={setCpf}
                                        paleta={paleta}
                                        erro={erroDe('cpf')}
                                        inputMode="numeric"
                                        dica="O Asaas pede o CPF para gerar o Pix na conta da loja. Ele não fica guardado aqui."
                                      />
                                    </div>
                                  </m.div>
                                )}
                              </AnimatePresence>
                            </OpcaoDaLista>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Só na demonstração: lá não há Asaas por trás, e a tela diz
                      isso em vez de fingir uma cobrança. Na loja de verdade o
                      Pix gera a cobrança, e este texto estaria errado. */}
                  <AnimatePresence initial={false}>
                    {pagaOnline && cardapio.operacao === null && (
                      <m.p
                        key="aviso-online"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                        className="overflow-hidden text-xs text-pretty"
                        style={{ color: paleta.suave }}
                      >
                        <span className="block pt-3">
                          Na versão final, ao confirmar você vai para a página segura do Asaas para
                          pagar. Nesta demonstração o pedido é registrado direto, sem cobrança.
                        </span>
                      </m.p>
                    )}
                  </AnimatePresence>
                </Secao>

                {/* O que o cliente escreve tem que caber em algum lugar, senão
                    vira ligação para a loja — ou pedido errado. */}
                <Secao titulo="Alguma observação?" paleta={paleta}>
                  <CampoDeTexto
                    id="observacao"
                    rotulo="Alguma observação?"
                    valor={observacao}
                    aoMudar={setObservacao}
                    paleta={paleta}
                    maxLength={300}
                    placeholder="Sem cebola, troca o refri por suco, apartamento no fundo…"
                  />
                </Secao>
              </>
            )}
          </>
        )}
      </div>

      {itens.length > 0 && usuarioId !== null && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
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
                  className="overflow-hidden text-sm font-medium"
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
                  className="overflow-hidden text-sm font-medium"
                >
                  <span className="block pb-2">
                    Pedido mínimo de {moeda(minimo ?? 0)} em itens para entrega. Faltam{' '}
                    {moeda(faltaParaOMinimo)}.
                  </span>
                </m.p>
              ) : tentou && temErro ? (
                <m.p
                  key="revise"
                  role="alert"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURACAO.curta, ease: CURVA_FOLHA }}
                  className="overflow-hidden text-sm font-medium"
                  style={{ color: paleta.erro }}
                >
                  <span className="block pb-2">Falta preencher os campos marcados.</span>
                </m.p>
              ) : null}
            </AnimatePresence>
            <button
              type="button"
              disabled={enviando || indisponivel || faltaParaOMinimo > 0}
              onClick={confirmar}
              className={`${estilos['foco']} flex h-13 w-full items-center justify-between rounded-lg px-4 text-base font-semibold transition-opacity duration-200 disabled:opacity-40`}
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
              <span className="tabular-nums">{moeda(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
