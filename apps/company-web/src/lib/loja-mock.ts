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
    grupos: [],
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
