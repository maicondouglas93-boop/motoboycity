import type { StoreCategory, StoreProduct } from './store-catalog.js';
import type { OperacaoPublica } from './store-operation.js';

/** O fundo da página da loja. As duas cores são medidas contra ele. */
export type StoreTheme = 'CLARO' | 'ESCURO';

/**
 * A cara da loja na página do cliente: duas cores livres, o tema e a logo. O
 * resto (o texto sobre as cores, o fundo) é calculado.
 */
export interface StoreIdentity {
  theme: StoreTheme;
  /** `#rrggbb`. Vira texto — o preço em destaque — e a faixa do topo. */
  brandColor: string;
  /** `#rrggbb`. Vira fundo de botão. */
  actionColor: string;
  logoUrl: string | null;
}

/**
 * A loja online no painel: o link, o nome que o cliente vê e a identidade.
 *
 * Antes do primeiro salvar, `slug` é nulo — a empresa ainda não tem loja
 * aberta ao público —, `suggestedSlug` sai do nome fantasia e a identidade é a
 * padrão. A sugestão não está reservada: outra loja pode ter chegado antes.
 */
export interface StoreSettings {
  slug: string | null;
  name: string;
  suggestedSlug: string;
  identity: StoreIdentity;
}

/** O produto como o cliente vê: só o publicado aparece, e a data de edição não interessa. */
export type PublicStoreProduct = Omit<StoreProduct, 'status' | 'updatedAt'>;

export interface PublicStore {
  slug: string;
  name: string;
  identity: StoreIdentity;
  /** Só as seções com algo à venda, na ordem da loja. */
  categories: StoreCategory[];
  /** Só o que dá para comprar, na ordem do cardápio. */
  products: PublicStoreProduct[];
  /** Horário, ajuste da hora, tipos de pedido, pagamento e bairros — sem os avisos. */
  operacao: OperacaoPublica;
}

/**
 * O que um link responde. O antigo continua valendo e aponta para o atual: o
 * panfleto e o QR impressos não morrem quando a loja troca de endereço.
 */
export type PublicStoreLookup =
  { kind: 'store'; store: PublicStore } | { kind: 'moved'; slug: string };
