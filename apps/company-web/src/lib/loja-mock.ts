/**
 * DADOS DE EXEMPLO — NÃO EXISTE API POR TRÁS DISTO.
 *
 * As telas da Loja foram construídas antes do backend, para o desenho ser
 * aprovado primeiro. Nada aqui é lido ou gravado em banco: o que a tela mostra
 * vive na memória do navegador e some ao recarregar.
 *
 * Quem for ligar à API deve APAGAR este arquivo, e não adaptá-lo — manter um
 * caminho de exemplo ao lado do caminho real é como as telas acabam mentindo
 * sobre o que está integrado.
 */

import type { TemaDaLoja } from '@/lib/contraste';

/**
 * O perfil da loja, como o cliente a vê na página de pedidos.
 *
 * As cores e o tema são os mesmos que a empresa escolhe em
 * `/loja/configuracoes` — esta é a tela onde eles finalmente aparecem.
 */
/** `HH:MM`, em 24h. */
export type Relogio = string;

export interface FaixaDeHorario {
  abre: Relogio;
  fecha: Relogio;
}

/**
 * Mais de uma faixa por dia porque isso é o comum, e não a exceção: lanchonete
 * que serve almoço e volta à noite fecharia das 14h às 18h. Com uma faixa só,
 * ela seria obrigada a declarar um horário que não pratica — e receberia
 * pedido com a cozinha apagada.
 */
export interface DiaDeFuncionamento {
  /** 0 = domingo, igual a `Date.getDay()`. */
  dia: number;
  faixas: FaixaDeHorario[];
}

export interface BairroAtendido {
  id: string;
  nome: string;
  taxa: number;
}

/**
 * Um dia em que a loja não abre, por cima do horário semanal.
 *
 * O horário da semana não sabe o que é 25 de dezembro. Sem esta lista, a única
 * forma de fechar num feriado seria apagar o horário do dia e lembrar de
 * recolocar depois — e quem esquece recebe pedido com a porta fechada.
 */
export interface DiaFechado {
  /** `AAAA-MM-DD`. */
  data: string;
  motivo: string;
}

/**
 * O endereço de onde o motoboy retira.
 *
 * NÃO é configuração da loja online: é o `CompanyAddress` com `isPrimary` que
 * a empresa já cadastra no painel, e sem o qual o próprio `deliveries.service`
 * recusa criar entrega. A loja só mostra qual é — e precisa dele também para
 * dizer ao cliente onde retirar, quando a retirada estiver ligada.
 */
export interface PontoDeColeta {
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface LojaDeExemplo {
  slug: string;
  nome: string;
  tema: TemaDaLoja;
  corDaMarca: string;
  corDeAcao: string;
  /**
   * Fechar a loja AGORA, por cima do horário.
   *
   * O horário diz a regra; isto diz a exceção — acabou o ingrediente, a
   * cozinha entupiu, está chovendo demais para o motoboy. Sem esse botão, a
   * única saída seria editar o horário e depois lembrar de desfazer.
   */
  pausadaManualmente: boolean;
  semana: DiaDeFuncionamento[];
  minutosDePreparo: number;
  /**
   * Taxa por bairro. Vazio quer dizer que a loja não cobra entrega na página,
   * e aí ela continua só na fatura que a central cobra da empresa.
   */
  bairros: BairroAtendido[];
  /** `null` quando a loja não exige valor mínimo. */
  pedidoMinimo: number | null;
  pagamentos: string[];
  diasFechados: DiaFechado[];
  pontoDeColeta: PontoDeColeta;
  /** Deixar o cliente buscar na loja, sem entrega e sem taxa. */
  aceitaRetirada: boolean;
  /** Tocar um som no painel quando entra pedido, com a aba aberta. */
  avisoSonoro: boolean;
  /** Notificação do navegador, que chega com a aba fechada. */
  avisoPush: boolean;
}

export const LOJA_DE_EXEMPLO: LojaDeExemplo = {
  slug: 'minha-loja',
  nome: 'Açaí do Centro',
  tema: 'CLARO',
  corDaMarca: '#c2410c',
  corDeAcao: '#15803d',
  pausadaManualmente: false,
  semana: [
    { dia: 0, faixas: [] },
    {
      dia: 1,
      faixas: [
        { abre: '11:00', fecha: '14:00' },
        { abre: '18:00', fecha: '22:00' },
      ],
    },
    {
      dia: 2,
      faixas: [
        { abre: '11:00', fecha: '14:00' },
        { abre: '18:00', fecha: '22:00' },
      ],
    },
    {
      dia: 3,
      faixas: [
        { abre: '11:00', fecha: '14:00' },
        { abre: '18:00', fecha: '22:00' },
      ],
    },
    {
      dia: 4,
      faixas: [
        { abre: '11:00', fecha: '14:00' },
        { abre: '18:00', fecha: '22:00' },
      ],
    },
    {
      dia: 5,
      faixas: [
        { abre: '11:00', fecha: '14:00' },
        { abre: '18:00', fecha: '23:00' },
      ],
    },
    { dia: 6, faixas: [{ abre: '11:00', fecha: '23:00' }] },
  ],
  minutosDePreparo: 20,
  bairros: [
    { id: 'b1', nome: 'Centro', taxa: 6 },
    { id: 'b2', nome: 'Sagrada Família', taxa: 8 },
    { id: 'b3', nome: 'Vila Nova', taxa: 10 },
    { id: 'b4', nome: 'Alto da Serra', taxa: 14 },
  ],
  pedidoMinimo: 15,
  pagamentos: ['Pix', 'Dinheiro', 'Cartão na entrega'],
  diasFechados: [{ data: '2026-12-25', motivo: 'Natal' }],
  pontoDeColeta: {
    rua: 'Rua Coronel Pedro Alves',
    numero: '140',
    complemento: null,
    bairro: 'Centro',
    cidade: 'Lajinha',
    estado: 'MG',
  },
  aceitaRetirada: true,
  avisoSonoro: true,
  avisoPush: false,
};

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function emMinutos(relogio: Relogio): number {
  const [hora, minuto] = relogio.split(':');
  return Number(hora) * 60 + Number(minuto);
}

export interface SituacaoDaLoja {
  aberta: boolean;
  /** Frase curta, do jeito que o cliente lê. */
  texto: string;
}

/**
 * Se dá para pedir agora, e o que dizer ao cliente.
 *
 * A pausa manual vence o horário: é para isso que ela existe. Depois dela, o
 * que manda é a faixa do dia — e quando está fechado, a tela diz QUANDO abre,
 * porque "fechado" sozinho só faz a pessoa sair sem saber se volta em dez
 * minutos ou amanhã.
 */
export function situacaoDaLoja(loja: LojaDeExemplo, agora: Date): SituacaoDaLoja {
  if (loja.pausadaManualmente) {
    return { aberta: false, texto: 'Fechada no momento' };
  }

  const dataDeHoje = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0'),
  ].join('-');

  // O feriado vence o horário da semana, e dizer o motivo evita o cliente
  // achar que a página quebrou.
  const fechadoHoje = loja.diasFechados.find((dia) => dia.data === dataDeHoje);
  if (fechadoHoje) {
    return { aberta: false, texto: `Fechado hoje · ${fechadoHoje.motivo}` };
  }

  const minutoDeAgora = agora.getHours() * 60 + agora.getMinutes();
  const hoje = loja.semana.find((item) => item.dia === agora.getDay());

  const faixaAberta = hoje?.faixas.find(
    (faixa) => minutoDeAgora >= emMinutos(faixa.abre) && minutoDeAgora < emMinutos(faixa.fecha),
  );
  if (faixaAberta) {
    return { aberta: true, texto: `Aberto até ${faixaAberta.fecha}` };
  }

  const proximaHoje = hoje?.faixas.find((faixa) => emMinutos(faixa.abre) > minutoDeAgora);
  if (proximaHoje) {
    return { aberta: false, texto: `Fechado · abre às ${proximaHoje.abre}` };
  }

  // Procura o próximo dia com faixa, dando a volta na semana.
  for (let passo = 1; passo <= 7; passo += 1) {
    const dia = (agora.getDay() + passo) % 7;
    const adiante = loja.semana.find((item) => item.dia === dia);
    const primeira = adiante?.faixas[0];
    if (primeira) {
      const quando = passo === 1 ? 'amanhã' : DIAS_DA_SEMANA[dia]?.toLowerCase();
      return { aberta: false, texto: `Fechado · abre ${quando} às ${primeira.abre}` };
    }
  }

  return { aberta: false, texto: 'Fechada' };
}

export interface CategoriaDeExemplo {
  id: string;
  nome: string;
}

export interface TamanhoDeExemplo {
  id: string;
  nome: string;
  /** Preço CHEIO do produto naquele tamanho, e não o acréscimo sobre uma base. */
  preco: number;
  disponivel: boolean;
}

export interface EscolhaDeExemplo {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
}

export interface GrupoDeExemplo {
  id: string;
  nome: string;
  minimo: number;
  /** `null` é "sem limite". */
  maximo: number | null;
  escolhas: EscolhaDeExemplo[];
}

/**
 * Três estados, e não um `ativo: boolean`.
 *
 * "Ainda não terminei de cadastrar" e "acabou o estoque hoje" são coisas
 * diferentes, e um booleano faz as duas parecerem a mesma na lista. A lojista
 * precisa distinguir o que exige trabalho do que exige só um clique quando
 * chegar mercadoria.
 */
export type SituacaoDoProduto = 'publicado' | 'rascunho' | 'pausado';

export interface ProdutoDeExemplo {
  id: string;
  nome: string;
  descricao: string;
  /**
   * Referência por id, e não o nome da categoria.
   *
   * Com o nome, renomear "Lanches" para "Salgados" deixaria todo produto
   * apontando para uma categoria que não existe mais. A tela de organizar
   * permite renomear, então o modelo tem que aguentar isso.
   */
  categoriaId: string | null;
  imagemUrl: string | null;
  /** Usado quando o produto não tem tamanhos; com tamanhos, o preço vem deles. */
  precoUnico: number | null;
  situacao: SituacaoDoProduto;
  tamanhos: TamanhoDeExemplo[];
  grupos: GrupoDeExemplo[];
}

export interface ItemDeVenda {
  nome: string;
  quantidade: number;
  /** Tamanho escolhido, quando o produto tem tamanhos. */
  tamanho: string | null;
  /** O que o cliente marcou nos grupos de escolhas, já com o preço somado. */
  escolhas: string[];
  total: number;
}

/**
 * Espelha `CompanyCustomerAddress` de `packages/types`, que é o que o cadastro
 * de clientes do painel já exige: campos separados, e não uma linha de texto.
 *
 * Por isso o checkout do PWA tem que coletar assim. Se ele pedir "endereço"
 * num campo só, salvar o cliente a partir da venda deixa de ser possível sem
 * alguém redigitar tudo no painel — o trabalho que a funcionalidade existe
 * para poupar.
 *
 * ATENÇÃO, contrato: `CompanyCustomerAddress` NÃO tem bairro, e aqui tem.
 *
 * A divergência é consequência da taxa por bairro, que a empresa configura em
 * `/loja/configuracoes`: se o preço da entrega depende do bairro, o checkout
 * tem que perguntar o bairro, e ele passa a fazer parte do endereço. Integrar
 * isso exige acrescentar o campo em `packages/types`, na validação e no
 * cadastro de clientes do painel — não dá para resolver só nesta tela.
 */
export interface EnderecoDaEntrega {
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  referencia: string | null;
}

/**
 * O que a loja já sabe deste cliente, conferido pelo TELEFONE.
 *
 * `enderecoNovo` existe porque `CompanyCustomerSavedAddress` já guarda vários
 * endereços por cliente. Sem esse terceiro estado, quem pedisse do trabalho em
 * vez de casa viraria um cliente duplicado.
 */
export type CadastroDoCliente = 'novo' | 'jaCadastrado' | 'enderecoNovo';

export interface VendaDeExemplo {
  id: string;
  numero: number;
  cliente: string;
  horario: string;
  total: number;
  situacao: 'agendado' | 'preparo' | 'rota' | 'entregue' | 'cancelado';
  itens: ItemDeVenda[];
  telefone: string;
  pagamento: string;
  /** Preenchido só quando o cliente paga em dinheiro. */
  trocoPara: number | null;
  entrega: EnderecoDaEntrega;
  cadastro: CadastroDoCliente;
  /**
   * O que o cliente escreveu: "sem cebola", "troca o refri por suco".
   *
   * Vai junto para a cozinha e, quando é sobre a entrega, para o motoboy. Sem
   * um campo, isso ia parar no telefone da loja — ou em lugar nenhum.
   */
  observacao: string | null;
  /** Retirada não gera entrega: o cliente busca no balcão. */
  retirarNaLoja: boolean;
  /**
   * Minutos que faltam para o pedido entrar no despacho e chamar o motoboy.
   *
   * Só existe enquanto a venda está `agendado`. É a janela em que a loja
   * consegue cancelar — depois dela, o pedido vira entrega e sai do controle
   * da loja.
   */
  minutosParaDespachar: number | null;
}

/**
 * A ORDEM DO ARRAY é a ordem em que as seções aparecem na loja. Não há campo
 * `ordem`: ele exigiria renumerar tudo a cada movimento e abriria espaço para
 * dois itens com o mesmo número. A tela de organizar move elementos no array.
 */
export const CATEGORIAS_DE_EXEMPLO: CategoriaDeExemplo[] = [
  { id: 'c1', nome: 'Açaí' },
  { id: 'c2', nome: 'Lanches' },
  { id: 'c3', nome: 'Sorvetes' },
  { id: 'c4', nome: 'Bebidas' },
];

export const PRODUTOS_DE_EXEMPLO: ProdutoDeExemplo[] = [
  {
    id: 'p1',
    nome: 'Açaí',
    descricao: 'Açaí cremoso batido na hora, com opção de adicionais.',
    categoriaId: 'c1',
    imagemUrl: null,
    precoUnico: null,
    situacao: 'publicado',
    tamanhos: [
      { id: 't1', nome: '300ml', preco: 12, disponivel: true },
      { id: 't2', nome: '500ml', preco: 18, disponivel: true },
      { id: 't3', nome: '700ml', preco: 24, disponivel: true },
    ],
    grupos: [
      {
        id: 'g1',
        nome: 'Adicionais',
        minimo: 0,
        maximo: null,
        escolhas: [
          { id: 'e1', nome: 'Leite condensado', preco: 2, disponivel: true },
          { id: 'e2', nome: 'Leite em pó', preco: 2, disponivel: true },
          { id: 'e3', nome: 'Morango', preco: 3, disponivel: true },
          { id: 'e4', nome: 'Paçoca', preco: 2, disponivel: false },
        ],
      },
    ],
  },
  {
    id: 'p2',
    nome: 'X-Burguer',
    descricao: 'Pão, hambúrguer 180g, queijo e salada.',
    categoriaId: 'c2',
    imagemUrl: null,
    precoUnico: 22,
    situacao: 'publicado',
    tamanhos: [],
    grupos: [
      {
        id: 'g2',
        nome: 'Adicionais',
        minimo: 0,
        maximo: 3,
        escolhas: [
          { id: 'e5', nome: 'Bacon', preco: 4, disponivel: true },
          { id: 'e6', nome: 'Ovo', preco: 2, disponivel: true },
          { id: 'e7', nome: 'Cheddar', preco: 3, disponivel: true },
        ],
      },
      /*
       * O caso que justifica o aviso de pendências existir: um grupo
       * OBRIGATÓRIO cuja única escolha foi marcada como indisponível. O produto
       * está no ar e ninguém consegue comprá-lo — a loja só descobriria pela
       * venda que não entra.
       */
      {
        id: 'g3',
        nome: 'Ponto da carne',
        minimo: 1,
        maximo: 1,
        escolhas: [{ id: 'e8', nome: 'Ao ponto', preco: 0, disponivel: false }],
      },
    ],
  },
  {
    id: 'p6',
    nome: 'X-Salada',
    descricao: 'Pão, hambúrguer 180g, queijo, alface e tomate.',
    categoriaId: 'c2',
    imagemUrl: null,
    precoUnico: 24,
    situacao: 'publicado',
    tamanhos: [],
    grupos: [
      /*
       * Grupo obrigatório SATISFAZÍVEL, ao contrário do que está no X-Burguer.
       * É o par que faz a regra ser conferível dos dois lados: aqui o cliente
       * escolhe e conclui; lá o painel avisa que ninguém consegue comprar.
       */
      {
        id: 'g4',
        nome: 'Ponto da carne',
        minimo: 1,
        maximo: 1,
        escolhas: [
          { id: 'e9', nome: 'Ao ponto', preco: 0, disponivel: true },
          { id: 'e10', nome: 'Bem passada', preco: 0, disponivel: true },
        ],
      },
    ],
  },
  {
    id: 'p3',
    nome: 'Sorvete casquinha',
    descricao: 'Sorvete tradicional na casquinha.',
    categoriaId: 'c3',
    imagemUrl: null,
    precoUnico: 6,
    situacao: 'publicado',
    tamanhos: [],
    grupos: [],
  },
  {
    id: 'p4',
    nome: 'Refrigerante 350ml',
    descricao: 'Diversos sabores.',
    categoriaId: 'c4',
    imagemUrl: null,
    precoUnico: 7,
    situacao: 'pausado',
    tamanhos: [],
    grupos: [],
  },
  {
    id: 'p5',
    nome: 'Milkshake',
    descricao: '',
    categoriaId: null,
    imagemUrl: null,
    precoUnico: null,
    situacao: 'rascunho',
    tamanhos: [],
    grupos: [],
  },
];

export const VENDAS_DE_EXEMPLO: VendaDeExemplo[] = [
  {
    id: 'v1',
    numero: 1542,
    cliente: 'Ana Ribeiro',
    horario: '10:24',
    total: 32.9,
    situacao: 'agendado',
    pagamento: 'Dinheiro na entrega',
    telefone: '(35) 99841-2207',
    trocoPara: 50,
    entrega: {
      rua: 'Rua Arnaldo Leite Ribeiro',
      numero: '212',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '36980-000',
      referencia: 'Portão azul, ao lado da padaria',
    },
    cadastro: 'novo',
    observacao: 'Sem granola, por favor.',
    retirarNaLoja: false,
    minutosParaDespachar: 6,
    itens: [
      {
        nome: 'Açaí',
        quantidade: 1,
        tamanho: '500ml',
        escolhas: ['Morango +R$ 3,00', 'Leite em pó +R$ 2,00'],
        total: 23,
      },
      { nome: 'Sorvete casquinha', quantidade: 1, tamanho: null, escolhas: [], total: 6 },
    ],
  },
  {
    id: 'v2',
    numero: 1541,
    cliente: 'Carlos Menezes',
    horario: '09:56',
    total: 45,
    situacao: 'preparo',
    pagamento: 'Pix pago na loja',
    telefone: '(35) 99712-6680',
    trocoPara: null,
    entrega: {
      rua: 'Rua das Flores',
      numero: '45',
      complemento: 'Apto 302',
      bairro: 'Sagrada Família',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '36980-000',
      referencia: null,
    },
    cadastro: 'enderecoNovo',
    observacao: null,
    retirarNaLoja: false,
    minutosParaDespachar: null,
    itens: [
      {
        nome: 'X-Burguer',
        quantidade: 2,
        tamanho: null,
        escolhas: ['Bacon +R$ 4,00'],
        total: 52,
      },
    ],
  },
  {
    id: 'v3',
    numero: 1540,
    cliente: 'Joana Prado',
    horario: '09:32',
    total: 27.5,
    situacao: 'rota',
    pagamento: 'Cartão na entrega',
    telefone: '(35) 99655-1143',
    trocoPara: null,
    entrega: {
      rua: 'Av. Principal',
      numero: '900',
      complemento: null,
      bairro: 'Vila Nova',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '36980-000',
      referencia: null,
    },
    cadastro: 'jaCadastrado',
    observacao: 'Apartamento no fundo, interfone quebrado.',
    retirarNaLoja: false,
    minutosParaDespachar: null,
    itens: [{ nome: 'Açaí', quantidade: 1, tamanho: '700ml', escolhas: [], total: 24 }],
  },
  {
    id: 'v4',
    numero: 1539,
    cliente: 'Marcos Lima',
    horario: '08:47',
    total: 18,
    situacao: 'entregue',
    pagamento: 'Pix pago na loja',
    telefone: '(35) 99655-1143',
    trocoPara: null,
    entrega: {
      rua: 'Rua do Comércio',
      numero: '77',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '36980-000',
      referencia: null,
    },
    cadastro: 'jaCadastrado',
    observacao: null,
    retirarNaLoja: false,
    minutosParaDespachar: null,
    itens: [{ nome: 'Açaí', quantidade: 1, tamanho: '500ml', escolhas: [], total: 18 }],
  },
  {
    id: 'v5',
    numero: 1538,
    cliente: 'Rita Souza',
    horario: '08:12',
    total: 52.9,
    situacao: 'cancelado',
    pagamento: 'Dinheiro na entrega',
    telefone: '(35) 99420-7781',
    trocoPara: 60,
    entrega: {
      rua: 'Rua Sete',
      numero: '310',
      complemento: null,
      bairro: 'Vila Nova',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '36980-000',
      referencia: null,
    },
    cadastro: 'novo',
    observacao: null,
    retirarNaLoja: false,
    minutosParaDespachar: null,
    itens: [{ nome: 'X-Burguer', quantidade: 2, tamanho: null, escolhas: [], total: 44 }],
  },
];

/**
 * A faixa de preço de um produto com tamanhos. Mostrar só o menor esconderia o
 * que o cliente realmente paga; mostrar só o maior assustaria sem motivo.
 */
export function faixaDePreco(produto: ProdutoDeExemplo): string {
  const moeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (produto.tamanhos.length === 0) {
    return produto.precoUnico === null ? 'Sem preço' : moeda(produto.precoUnico);
  }
  const precos = produto.tamanhos.map((tamanho) => tamanho.preco);
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  return menor === maior ? moeda(menor) : `${moeda(menor)} a ${moeda(maior)}`;
}

export interface Pendencia {
  texto: string;
  /**
   * Separa "o cliente não consegue comprar" de "ficaria melhor assim".
   *
   * Sem essa distinção, faltar foto e faltar preço aparecem com o mesmo peso —
   * e um aviso que grita por tudo deixa de ser lido justamente quando importa.
   */
  impedeVender: boolean;
}

export function pendenciasDoProduto(produto: ProdutoDeExemplo): Pendencia[] {
  const lista: Pendencia[] = [];

  if (produto.nome.trim() === '') {
    lista.push({ texto: 'sem nome', impedeVender: true });
  }

  const semPrecoUnico = produto.precoUnico === null || produto.precoUnico <= 0;
  if (produto.tamanhos.length === 0 && semPrecoUnico) {
    lista.push({ texto: 'sem preço', impedeVender: true });
  }

  const tamanhosSemPreco = produto.tamanhos.filter((tamanho) => tamanho.preco <= 0);
  if (tamanhosSemPreco.length > 0) {
    const nomes = tamanhosSemPreco.map((tamanho) => tamanho.nome || 'sem nome').join(', ');
    lista.push({ texto: `tamanho sem preço: ${nomes}`, impedeVender: true });
  }

  /*
   * A pendência mais séria, e a menos óbvia: um grupo obrigatório sem escolhas
   * disponíveis em número suficiente trava o carrinho. O produto aparece
   * normalmente na loja e simplesmente não dá para concluir o pedido.
   */
  for (const grupo of produto.grupos) {
    if (grupo.minimo < 1) continue;
    const disponiveis = grupo.escolhas.filter((escolha) => escolha.disponivel).length;
    if (disponiveis < grupo.minimo) {
      const plural = disponiveis === 1 ? 'disponível' : 'disponíveis';
      lista.push({
        texto: `"${grupo.nome}" exige ${grupo.minimo} e só tem ${disponiveis} ${plural} — o cliente não fecha o pedido`,
        impedeVender: true,
      });
    }
  }

  /*
   * Bloqueia, e não é só recomendação: a loja é organizada em seções, e cada
   * seção é uma categoria. Um produto sem categoria não tem onde aparecer — o
   * cliente nunca chega nele, o que na prática é o mesmo que não estar à venda.
   */
  if (produto.categoriaId === null) {
    lista.push({
      texto: 'sem categoria — não aparece em nenhuma seção da loja',
      impedeVender: true,
    });
  }
  if (produto.imagemUrl === null) {
    lista.push({ texto: 'sem foto', impedeVender: false });
  }
  if (produto.descricao.trim() === '') {
    lista.push({ texto: 'sem descrição', impedeVender: false });
  }

  return lista;
}

/**
 * Monta a linha do endereço a partir das partes.
 *
 * Guardar também uma versão pronta em texto criaria duas fontes de verdade, e
 * a que aparece na tela iria divergir da que vai para o cadastro do cliente.
 */
export function enderecoEmLinha(entrega: EnderecoDaEntrega): string {
  const inicio = `${entrega.rua}, ${entrega.numero}`;
  const com = entrega.complemento ? `${inicio} — ${entrega.complemento}` : inicio;
  return `${com} · ${entrega.bairro}, ${entrega.cidade}/${entrega.estado}`;
}

/** A taxa do bairro escolhido. `null` quando a loja não cobra entrega. */
export function taxaDoBairro(loja: LojaDeExemplo, bairroId: string | null): number | null {
  if (loja.bairros.length === 0) return null;
  return loja.bairros.find((bairro) => bairro.id === bairroId)?.taxa ?? null;
}
