/**
 * Catálogo da loja online da empresa: seções, produtos, tamanhos e grupos de
 * escolhas. É o que a empresa cadastra no painel e o que o cliente compra na
 * página de pedidos.
 *
 * A ordem é a ordem das listas. O servidor guarda uma posição por item, mas o
 * contrato nunca expõe esse número — quem reordena manda a lista inteira.
 */

/**
 * Três situações, e não um booleano: "não terminei de cadastrar" (DRAFT) e
 * "acabou hoje" (PAUSED) são coisas diferentes para quem opera a loja.
 */
export type StoreProductStatus = 'PUBLISHED' | 'DRAFT' | 'PAUSED';

/**
 * O que o item do cardápio é. `COMBO`: vários produtos da loja por um preço só; a loja escolhe
 * ao criar, e não muda depois.
 */
export type StoreProductKind = 'PRODUCT' | 'COMBO';

export interface StoreCategory {
  id: string;
  name: string;
}

export interface StoreProductSize {
  id: string;
  name: string;
  /** Preço CHEIO naquele tamanho, e não o acréscimo sobre uma base. */
  price: number;
  available: boolean;
}

export interface StoreOption {
  id: string;
  name: string;
  /** O que a escolha soma ao preço. Zero é de graça. */
  price: number;
  available: boolean;
}

export interface StoreOptionGroup {
  id: string;
  name: string;
  /** A partir de 1, o grupo é obrigatório. */
  minChoices: number;
  /** `null`: sem limite. */
  maxChoices: number | null;
  options: StoreOption[];
}

/**
 * Um produto que o combo leva. `sizeId` é o tamanho fixo do produto que tem tamanhos; `null` no
 * produto de um preço só.
 */
export interface StoreComboItem {
  productId: string;
  sizeId: string | null;
  quantity: number;
}

export interface StoreProduct {
  id: string;
  kind: StoreProductKind;
  /** `null`: sem seção — o produto não aparece na loja enquanto não tiver uma. */
  categoryId: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  /**
   * Sem tamanhos, o preço. Com tamanhos, `null`: o preço vem de cada um. No combo, o preço do
   * combo todo — o que o cliente paga, e não a soma dos itens.
   */
  price: number | null;
  status: StoreProductStatus;
  /**
   * Quantas unidades a loja tem, do produto todo (os tamanhos dividem o mesmo estoque).
   * `null`: sem controle, que é como todo produto nasce. Com número, cada pedido baixa a
   * quantidade pedida, o pedido cancelado devolve, e em zero o produto fica "esgotado" na
   * página — sem mudar o `status`, que é escolha da loja.
   */
  stock: number | null;
  /**
   * Só no combo: o que ele leva, na ordem. Vazio no produto. O combo não tem estoque próprio —
   * o que ele tem é o dos produtos daqui —, nem tamanhos.
   */
  comboItems: StoreComboItem[];
  sizes: StoreProductSize[];
  optionGroups: StoreOptionGroup[];
  updatedAt: string;
}

/**
 * O catálogo inteiro, na ordem em que o cliente vê: as categorias na ordem da
 * loja, e os produtos na ordem das categorias e, dentro de cada uma, na ordem
 * dela. Os produtos sem categoria vêm por último.
 */
export interface StoreCatalog {
  categories: StoreCategory[];
  products: StoreProduct[];
}

/**
 * Algo que falta no cadastro do produto. `blocking` separa "o cliente não
 * consegue comprar" de "ficaria melhor assim": sem essa distinção, faltar foto
 * e faltar preço teriam o mesmo peso — e o aviso que grita por tudo deixa de
 * ser lido justamente quando importa.
 */
export interface StoreProductIssue {
  text: string;
  blocking: boolean;
}
