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

import type { BairroAtendido, FormaDePagamento, GrupoDePagamento } from '@motoboycity/types';
import type { TemaDaLoja } from '@/lib/contraste';
import { descricaoDaForma } from '@/lib/loja-pagamentos';
import { instanteNaLoja, momentoNaLoja, somarDias } from '@/lib/loja-horario';
import type { OperacaoDaLoja } from '@/lib/loja-operacao';
import type { AndamentoDoPedido, EtapaDoPedido } from '@/lib/loja-pedido';

export type { BairroAtendido, FormaDePagamento, GrupoDePagamento };

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

export {
  FORMAS_DE_PAGAMENTO,
  GRUPOS_DE_PAGAMENTO,
  descricaoDaForma,
  resumoDosPagamentos,
  rotuloDoPagamento,
  type DescricaoDaForma,
} from '@/lib/loja-pagamentos';

/**
 * As formas que o cliente pode escolher agora: as que a loja marcou, menos as
 * online quando a conta Asaas não existe.
 *
 * O painel já impede marcar forma online sem conta, mas a loja confere de novo.
 * Mostrar Pix online sem Asaas seria aceitar um pedido cujo pagamento não tem
 * para onde ir.
 */
export function formasOferecidas(loja: LojaDeExemplo): FormaDePagamento[] {
  return loja.pagamentos.filter(
    (valor) => loja.asaasConfigurado || descricaoDaForma(valor).grupo !== 'ONLINE',
  );
}

/**
 * O perfil da loja, como o cliente a vê na página de pedidos.
 *
 * As cores e o tema são os mesmos que a empresa escolhe em
 * `/loja/configuracoes` — esta é a tela onde eles finalmente aparecem. Como a
 * loja FUNCIONA — horário, tipos de pedido, agendamento, avisos — fica à parte,
 * em `OPERACAO_DE_EXEMPLO`.
 */
export interface LojaDeExemplo {
  slug: string;
  nome: string;
  tema: TemaDaLoja;
  corDaMarca: string;
  corDeAcao: string;
  /**
   * Taxa por bairro. Vazio quer dizer que a loja não cobra entrega na página,
   * e aí ela continua só na fatura que a central cobra da empresa.
   */
  bairros: BairroAtendido[];
  pagamentos: FormaDePagamento[];
  /**
   * Se a loja já cadastrou a conta Asaas. Sem ela, nenhuma forma online pode ser
   * oferecida: não haveria para onde o dinheiro ir.
   */
  asaasConfigurado: boolean;
  pontoDeColeta: PontoDeColeta;
}

export const LOJA_DE_EXEMPLO: LojaDeExemplo = {
  slug: 'minha-loja',
  nome: 'Açaí do Centro',
  tema: 'CLARO',
  corDaMarca: '#c2410c',
  corDeAcao: '#15803d',
  bairros: [
    { id: 'b1', nome: 'Centro', taxa: 6 },
    { id: 'b2', nome: 'Sagrada Família', taxa: 8 },
    { id: 'b3', nome: 'Vila Nova', taxa: 10 },
    { id: 'b4', nome: 'Alto da Serra', taxa: 14 },
  ],
  pagamentos: ['PIX_ONLINE', 'CREDITO_ONLINE', 'DINHEIRO', 'PIX_MAQUININHA', 'DEBITO_MAQUININHA'],
  asaasConfigurado: true,
  pontoDeColeta: {
    rua: 'Rua Coronel Pedro Alves',
    numero: '140',
    complemento: null,
    bairro: 'Centro',
    cidade: 'Lajinha',
    estado: 'MG',
  },
};

const ALMOCO_E_JANTA = [
  { abre: '11:00', fecha: '14:00' },
  { abre: '18:00', fecha: '22:00' },
];

/**
 * Como a loja de exemplo funciona. Os valores foram escolhidos para mostrar
 * cada caso da tela: domingo fechado, dois períodos por dia, sexta e sábado
 * passando da meia-noite, feriado, horário especial na véspera de Natal e
 * férias de uma semana.
 */
export const OPERACAO_DE_EXEMPLO: OperacaoDaLoja = {
  funcionamento: {
    semana: [
      { dia: 0, faixas: [] },
      { dia: 1, faixas: ALMOCO_E_JANTA },
      { dia: 2, faixas: ALMOCO_E_JANTA },
      { dia: 3, faixas: ALMOCO_E_JANTA },
      { dia: 4, faixas: ALMOCO_E_JANTA },
      {
        dia: 5,
        faixas: [
          { abre: '11:00', fecha: '14:00' },
          { abre: '18:00', fecha: '00:30' },
        ],
      },
      {
        dia: 6,
        faixas: [
          { abre: '11:00', fecha: '15:00' },
          { abre: '18:00', fecha: '01:00' },
        ],
      },
    ],
    excecoes: [
      {
        id: 'x1',
        inicio: '2026-10-12',
        fim: '2026-10-12',
        tipo: 'FECHADO',
        motivo: 'Nossa Senhora Aparecida',
        faixas: [],
      },
      {
        id: 'x2',
        inicio: '2026-12-24',
        fim: '2026-12-24',
        tipo: 'HORARIO_ESPECIAL',
        motivo: 'Véspera de Natal',
        faixas: [{ abre: '11:00', fecha: '16:00' }],
      },
      {
        id: 'x3',
        inicio: '2026-12-25',
        fim: '2026-12-25',
        tipo: 'FECHADO',
        motivo: 'Natal',
        faixas: [],
      },
      {
        id: 'x4',
        inicio: '2027-01-04',
        fim: '2027-01-10',
        tipo: 'FECHADO',
        motivo: 'Férias coletivas',
        faixas: [],
      },
    ],
    ajuste: null,
    // Sem repetir o que a página já calcula — o horário e o "dá para agendar".
    mensagemFechada: 'Obrigado pela visita! Logo mais a cozinha está de volta.',
  },
  recebimento: {
    modo: 'AUTOMATICO',
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    // Ligado por padrão: no aceite manual, sem prazo, quem paga pela tela
    // esquecida é o cliente, esperando uma resposta que não vem.
    prazoDoAceiteMin: 10,
  },
  entrega: { ativa: true, quemEntrega: 'MOTOBOYCITY', pedidoMinimo: 15, agendamento: true },
  retirada: {
    ativa: true,
    endereco: null,
    instrucoes: 'Retire no balcão, dizendo o número do pedido.',
    agendamento: true,
  },
  agendamento: {
    permitir: true,
    antecedenciaMinimaMin: 60,
    antecedenciaMaximaDias: 7,
    intervaloMin: 30,
  },
  notificacoes: {
    lojista: {
      NOVO_PEDIDO: { push: true, som: true },
      PEDIDO_CANCELADO: { push: true, som: true },
      PEDIDO_AGENDADO: { push: true, som: false },
      PAGAMENTO_RECEBIDO: { push: true, som: false },
      LOJA_FECHANDO: { push: false, som: true },
    },
    minutosAntesDeFechar: 15,
    repetirSom: true,
    cliente: {
      RECEBIDO: true,
      ACEITO: true,
      EM_PREPARO: false,
      PRONTO_PARA_RETIRAR: true,
      SAIU_PARA_ENTREGA: true,
      ENTREGUE: true,
      CANCELADO: true,
    },
  },
  pagamentos: LOJA_DE_EXEMPLO.pagamentos,
  bairros: LOJA_DE_EXEMPLO.bairros,
};

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

/**
 * Uma venda como a loja a vê no painel.
 *
 * O caminho — etapa, histórico, agendamento, tempos — vem de
 * `AndamentoDoPedido`, com as regras em `loja-pedido.ts`. Aqui fica o resto.
 */
export interface VendaDaLoja extends AndamentoDoPedido {
  cliente: string;
  telefone: string;
  total: number;
  itens: ItemDeVenda[];
  pagamento: string;
  /** Preenchido só quando o cliente paga em dinheiro. */
  trocoPara: number | null;
  /** `null` na retirada: não há para onde levar. */
  entrega: EnderecoDaEntrega | null;
  cadastro: CadastroDoCliente;
  /**
   * O que o cliente escreveu: "sem cebola", "troca o refri por suco".
   *
   * Vai junto para a cozinha e, quando é sobre a entrega, para o motoboy. Sem
   * um campo, isso ia parar no telefone da loja — ou em lugar nenhum.
   */
  observacao: string | null;
  /**
   * DEMONSTRAÇÃO: a conta de quem pediu nesta página, para "Meus pedidos" achar
   * a venda certa. `null` nos exemplos. Na integração o pedido pertence ao
   * cliente no banco, e isto some.
   */
  contaDoCliente: string | null;
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

/**
 * As vendas de exemplo, com as horas contadas a partir de `agora` — senão o
 * painel abriria mostrando pedido "em preparação" desde ontem. Uma de cada
 * etapa, uma retirada e uma agendada para amanhã, para cada caso da tela
 * aparecer sem ninguém precisar fazer pedido.
 *
 * Todas entram aceitas: a loja de exemplo aceita automaticamente. Para ver um
 * pedido esperando aceite, troque para o aceite manual em Tipos de pedido e
 * faça um pedido pela página da loja.
 */
export function vendasDeExemplo(agora: Date): VendaDaLoja[] {
  const ha = (minutos: number) => new Date(agora.getTime() - minutos * 60_000).toISOString();
  const passos = (...lista: Array<[EtapaDoPedido, number]>) =>
    lista.map(([etapa, minutos]) => ({ etapa, em: ha(minutos) }));

  const amanha = somarDias(momentoNaLoja(agora).data, 1);
  const tempos = { minutosDePreparo: 20, minutosDeEntrega: 15 };

  return [
    {
      numero: 1544,
      cliente: 'Beatriz Nunes',
      telefone: '(35) 99873-4410',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'ACEITO',
      historico: passos(['NOVO', 12], ['ACEITO', 12]),
      janela: {
        inicio: instanteNaLoja(amanha, 12 * 60).toISOString(),
        fim: instanteNaLoja(amanha, 12 * 60 + 30).toISOString(),
      },
      ...tempos,
      cancelamento: null,
      total: 44,
      pagamento: 'Pix online',
      trocoPara: null,
      entrega: {
        rua: 'Rua Padre Júlio',
        numero: '58',
        complemento: 'Casa 2',
        bairro: 'Sagrada Família',
        cidade: 'Lajinha',
        estado: 'MG',
        cep: '36980-000',
        referencia: null,
      },
      cadastro: 'novo',
      observacao: 'Para o almoço do escritório.',
      contaDoCliente: null,
      itens: [{ nome: 'Açaí', quantidade: 2, tamanho: '500ml', escolhas: ['Granola'], total: 36 }],
    },
    {
      numero: 1543,
      cliente: 'Lucas Andrade',
      telefone: '(35) 99120-5563',
      modalidade: 'RETIRADA',
      entregaPor: null,
      etapa: 'PRONTO',
      historico: passos(['NOVO', 18], ['ACEITO', 18], ['EM_PREPARO', 15], ['PRONTO', 2]),
      janela: null,
      ...tempos,
      cancelamento: null,
      total: 24,
      pagamento: 'Pix online',
      trocoPara: null,
      entrega: null,
      cadastro: 'jaCadastrado',
      observacao: null,
      contaDoCliente: null,
      itens: [
        { nome: 'X-Salada', quantidade: 1, tamanho: null, escolhas: ['Ao ponto'], total: 24 },
      ],
    },
    {
      numero: 1542,
      cliente: 'Ana Ribeiro',
      telefone: '(35) 99841-2207',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'ACEITO',
      historico: passos(['NOVO', 3], ['ACEITO', 3]),
      janela: null,
      ...tempos,
      cancelamento: null,
      total: 32.9,
      pagamento: 'Dinheiro na entrega',
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
      contaDoCliente: null,
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
      numero: 1541,
      cliente: 'Carlos Menezes',
      telefone: '(35) 99712-6680',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'EM_PREPARO',
      historico: passos(['NOVO', 14], ['ACEITO', 14], ['EM_PREPARO', 9]),
      janela: null,
      ...tempos,
      cancelamento: null,
      total: 45,
      pagamento: 'Pix online',
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
      contaDoCliente: null,
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
      numero: 1540,
      cliente: 'Joana Prado',
      telefone: '(35) 99655-1143',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'SAIU_PARA_ENTREGA',
      historico: passos(
        ['NOVO', 38],
        ['ACEITO', 38],
        ['EM_PREPARO', 33],
        ['PRONTO', 16],
        ['SAIU_PARA_ENTREGA', 9],
      ),
      janela: null,
      ...tempos,
      cancelamento: null,
      total: 27.5,
      pagamento: 'Crédito na maquininha',
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
      contaDoCliente: null,
      itens: [{ nome: 'Açaí', quantidade: 1, tamanho: '700ml', escolhas: [], total: 24 }],
    },
    {
      numero: 1539,
      cliente: 'Marcos Lima',
      telefone: '(35) 99655-1143',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'ENTREGUE',
      historico: passos(
        ['NOVO', 95],
        ['ACEITO', 95],
        ['EM_PREPARO', 90],
        ['PRONTO', 72],
        ['SAIU_PARA_ENTREGA', 66],
        ['ENTREGUE', 51],
      ),
      janela: null,
      ...tempos,
      cancelamento: null,
      total: 18,
      pagamento: 'Pix online',
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
      contaDoCliente: null,
      itens: [{ nome: 'Açaí', quantidade: 1, tamanho: '500ml', escolhas: [], total: 18 }],
    },
    {
      numero: 1538,
      cliente: 'Rita Souza',
      telefone: '(35) 99420-7781',
      modalidade: 'ENTREGA',
      entregaPor: 'MOTOBOYCITY',
      etapa: 'CANCELADO',
      historico: passos(['NOVO', 130], ['ACEITO', 130], ['CANCELADO', 124]),
      janela: null,
      ...tempos,
      cancelamento: { motivo: 'Item em falta', por: 'LOJA' },
      total: 52.9,
      pagamento: 'Dinheiro na entrega',
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
      contaDoCliente: null,
      itens: [{ nome: 'X-Burguer', quantidade: 2, tamanho: null, escolhas: [], total: 44 }],
    },
  ];
}

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
