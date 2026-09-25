import type { StoreCatalog, StoreCategory, StoreProduct } from '@motoboycity/types';
import type {
  ReorderStoreCategoriesPayload,
  ReorderStoreProductsPayload,
  StoreCategoryNamePayload,
  UpdateStoreProductStatusPayload,
  UpsertStoreProductPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreCatalogApiConfig {
  baseUrl: string;
}

/** O catálogo da loja online, do lado do painel da empresa. */
export function createCompanyStoreCatalogApi({ baseUrl }: CompanyStoreCatalogApiConfig) {
  function comToken(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async function enviar<T>(
    accessToken: string,
    caminho: string,
    method: 'POST' | 'PUT' | 'DELETE',
    corpo?: unknown,
  ): Promise<T> {
    const response = await apiFetch(`${baseUrl}/company/store${caminho}`, {
      method,
      headers:
        corpo === undefined
          ? comToken(accessToken)
          : { ...comToken(accessToken), 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return parseJsonOrThrow<T>(response);
  }

  return {
    /** Tudo, na ordem do cardápio. */
    async catalog(accessToken: string): Promise<StoreCatalog> {
      const response = await apiFetch(`${baseUrl}/company/store/catalog`, {
        headers: comToken(accessToken),
      });
      return parseJsonOrThrow<StoreCatalog>(response);
    },

    createCategory(accessToken: string, payload: StoreCategoryNamePayload) {
      return enviar<StoreCategory>(accessToken, '/categories', 'POST', payload);
    },

    renameCategory(accessToken: string, id: string, payload: StoreCategoryNamePayload) {
      return enviar<StoreCategory>(accessToken, `/categories/${id}`, 'PUT', payload);
    },

    /** Recusada (409) enquanto a categoria tiver produto. */
    deleteCategory(accessToken: string, id: string) {
      return enviar<{ deleted: true }>(accessToken, `/categories/${id}`, 'DELETE');
    },

    /** A ordem nova de todas as categorias. Recusada (409) se a lista estiver desatualizada. */
    reorderCategories(accessToken: string, payload: ReorderStoreCategoriesPayload) {
      return enviar<StoreCategory[]>(accessToken, '/categories/order', 'PUT', payload);
    },

    createProduct(accessToken: string, payload: UpsertStoreProductPayload) {
      return enviar<StoreProduct>(accessToken, '/products', 'POST', payload);
    },

    updateProduct(accessToken: string, id: string, payload: UpsertStoreProductPayload) {
      return enviar<StoreProduct>(accessToken, `/products/${id}`, 'PUT', payload);
    },

    /** Publicar, pausar ou voltar a rascunho. Publicar com pendência que impede vender é recusado. */
    updateProductStatus(accessToken: string, id: string, payload: UpdateStoreProductStatusPayload) {
      return enviar<StoreProduct>(accessToken, `/products/${id}/status`, 'PUT', payload);
    },

    deleteProduct(accessToken: string, id: string) {
      return enviar<{ deleted: true }>(accessToken, `/products/${id}`, 'DELETE');
    },

    /** Põe ou troca a foto: JPEG, PNG ou WebP de até 5 MB. */
    async uploadProductImage(accessToken: string, id: string, foto: Blob): Promise<StoreProduct> {
      const corpo = new FormData();
      corpo.append('file', foto);
      const response = await apiFetch(`${baseUrl}/company/store/products/${id}/image`, {
        method: 'PUT',
        headers: comToken(accessToken),
        body: corpo,
      });
      return parseJsonOrThrow<StoreProduct>(response);
    },

    removeProductImage(accessToken: string, id: string) {
      return enviar<StoreProduct>(accessToken, `/products/${id}/image`, 'DELETE');
    },

    /** A ordem nova dos produtos de uma categoria. Recusada (409) se a lista estiver desatualizada. */
    reorderProducts(accessToken: string, payload: ReorderStoreProductsPayload) {
      return enviar<StoreProduct[]>(accessToken, '/products/order', 'PUT', payload);
    },
  };
}
