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

export interface TamanhoDeExemplo {
  id: string;
  nome: string;
  /** Preço CHEIO do produto naquele tamanho, e não o acréscimo sobre uma base. */
  preco: number;
  disponivel: boolean;
}

export interface AdicionalDeExemplo {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
}

export interface ProdutoDeExemplo {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  imagemUrl: string | null;
  /** Usado quando o produto não tem tamanhos; com tamanhos, o preço vem deles. */
  precoUnico: number | null;
  ativo: boolean;
  tamanhos: TamanhoDeExemplo[];
  adicionais: AdicionalDeExemplo[];
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

export interface VendaDeExemplo {
  id: string;
  numero: number;
  cliente: string;
  horario: string;
  total: number;
  situacao: 'agendado' | 'preparo' | 'rota' | 'entregue' | 'cancelado';
  itens: ItemDeVenda[];
  pagamento: string;
  /** Preenchido só quando o cliente paga em dinheiro. */
  trocoPara: number | null;
  endereco: string;
  /**
   * Minutos que faltam para o pedido entrar no despacho e chamar o motoboy.
   *
   * Só existe enquanto a venda está `agendado`. É a janela em que a loja
   * consegue cancelar — depois dela, o pedido vira entrega e sai do controle
   * da loja.
   */
  minutosParaDespachar: number | null;
}

export const CATEGORIAS_DE_EXEMPLO = ['Açaí', 'Sorvetes', 'Lanches', 'Bebidas'];

export const PRODUTOS_DE_EXEMPLO: ProdutoDeExemplo[] = [
  {
    id: 'p1',
    nome: 'Açaí',
    descricao: 'Açaí cremoso batido na hora, com opção de adicionais.',
    categoria: 'Açaí',
    imagemUrl: null,
    precoUnico: null,
    ativo: true,
    tamanhos: [
      { id: 't1', nome: '300ml', preco: 12, disponivel: true },
      { id: 't2', nome: '500ml', preco: 18, disponivel: true },
      { id: 't3', nome: '700ml', preco: 24, disponivel: true },
    ],
    adicionais: [
      { id: 'a1', nome: 'Leite condensado', preco: 2, disponivel: true },
      { id: 'a2', nome: 'Leite em pó', preco: 2, disponivel: true },
      { id: 'a3', nome: 'Morango', preco: 3, disponivel: true },
      { id: 'a4', nome: 'Paçoca', preco: 2, disponivel: false },
    ],
  },
  {
    id: 'p2',
    nome: 'X-Burguer',
    descricao: 'Pão, hambúrguer 180g, queijo e salada.',
    categoria: 'Lanches',
    imagemUrl: null,
    precoUnico: 22,
    ativo: true,
    tamanhos: [],
    adicionais: [
      { id: 'a5', nome: 'Bacon', preco: 4, disponivel: true },
      { id: 'a6', nome: 'Ovo', preco: 2, disponivel: true },
      { id: 'a7', nome: 'Cheddar', preco: 3, disponivel: true },
    ],
  },
  {
    id: 'p3',
    nome: 'Sorvete casquinha',
    descricao: 'Sorvete tradicional na casquinha.',
    categoria: 'Sorvetes',
    imagemUrl: null,
    precoUnico: 6,
    ativo: true,
    tamanhos: [],
    adicionais: [],
  },
  {
    id: 'p4',
    nome: 'Refrigerante 350ml',
    descricao: 'Diversos sabores.',
    categoria: 'Bebidas',
    imagemUrl: null,
    precoUnico: 7,
    ativo: false,
    tamanhos: [],
    adicionais: [],
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
    trocoPara: 50,
    endereco: 'Rua Arnaldo Leite Ribeiro, 212 - Centro',
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
    trocoPara: null,
    endereco: 'Rua das Flores, 45',
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
    trocoPara: null,
    endereco: 'Av. Principal, 900',
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
    trocoPara: null,
    endereco: 'Rua do Comércio, 77',
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
    trocoPara: 60,
    endereco: 'Rua Sete, 310',
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
