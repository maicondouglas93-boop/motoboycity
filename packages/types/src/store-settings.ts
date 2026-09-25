import type { StoreCategory, StoreProduct } from './store-catalog.js';

/**
 * A loja online no painel: o link e o nome que o cliente vê.
 *
 * Antes do primeiro salvar, `slug` é nulo — a empresa ainda não tem loja
 * aberta ao público — e `suggestedSlug` sai do nome fantasia. A sugestão não
 * está reservada: outra loja pode ter chegado antes.
 */
export interface StoreSettings {
  slug: string | null;
  name: string;
  suggestedSlug: string;
}

/** O produto como o cliente vê: só o publicado aparece, e a data de edição não interessa. */
export type PublicStoreProduct = Omit<StoreProduct, 'status' | 'updatedAt'>;

export interface PublicStore {
  slug: string;
  name: string;
  /** Só as seções com algo à venda, na ordem da loja. */
  categories: StoreCategory[];
  /** Só o que dá para comprar, na ordem do cardápio. */
  products: PublicStoreProduct[];
}

/**
 * O que um link responde. O antigo continua valendo e aponta para o atual: o
 * panfleto e o QR impressos não morrem quando a loja troca de endereço.
 */
export type PublicStoreLookup =
  { kind: 'store'; store: PublicStore } | { kind: 'moved'; slug: string };
