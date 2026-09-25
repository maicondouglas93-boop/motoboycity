'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type {
  StoreCatalog,
  StoreCategory,
  StoreProduct,
  StoreProductStatus,
} from '@motoboycity/types';
import { companyStoreCatalogApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * O catálogo da loja no painel: a consulta e o que as telas de Produtos,
 * Organizar e o formulário dividem.
 *
 * Uma consulta só, para o catálogo inteiro. A loja pequena tem dezenas de
 * produtos, e não milhares: buscar tudo de uma vez é mais simples e deixa as
 * três telas concordando sobre a mesma ordem.
 */

export const CHAVE_DO_CATALOGO = ['company', 'store', 'catalog'] as const;

/**
 * Chave das gravações da tela Organizar, e a fila em que elas correm uma de
 * cada vez.
 *
 * Quem clica "subir" três vezes seguidas manda três listas. Em paralelo, a
 * segunda poderia chegar ao servidor depois da terceira, e o cardápio ficaria
 * na ordem do meio enquanto a tela mostra a última. Renomear entra na mesma
 * fila: a releitura do catálogo depois de uma ordem traria o nome antigo de
 * uma categoria que ainda estivesse sendo renomeada.
 */
export const CHAVE_DA_FILA = ['company', 'store', 'organize'] as const;
const FILA_DO_CATALOGO = { id: 'company-store-organize' };

export function useCatalogo() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DO_CATALOGO,
    queryFn: () => companyStoreCatalogApi.catalog(token as string),
    enabled: Boolean(token),
  });
}

/** O que as gravações da tela Organizar dividem: a fila, a tela antes da resposta, a releitura. */
export function useFilaDoCatalogo() {
  const queryClient = useQueryClient();
  return {
    opcoes: { mutationKey: CHAVE_DA_FILA, scope: FILA_DO_CATALOGO },

    /**
     * A tela muda antes da resposta. Cancelar a leitura em andamento impede que
     * ela chegue depois com o catálogo de antes e desfaça o que se acabou de ver.
     */
    mudarNaTela(mudar: (atual: StoreCatalog) => StoreCatalog) {
      void queryClient.cancelQueries({ queryKey: CHAVE_DO_CATALOGO });
      queryClient.setQueryData<StoreCatalog>(CHAVE_DO_CATALOGO, (atual) => atual && mudar(atual));
    },

    /**
     * A última gravação da fila relê o catálogo: se alguma foi recusada, a tela
     * volta ao que ficou gravado. Contar 1 é contar a própria gravação — o
     * `onSettled` roda antes de ela sair da lista das pendentes.
     */
    depoisDeGravar() {
      if (queryClient.isMutating({ mutationKey: CHAVE_DA_FILA }) === 1) {
        void queryClient.invalidateQueries({ queryKey: CHAVE_DO_CATALOGO });
      }
    },
  };
}

export const SITUACOES: Record<StoreProductStatus, { texto: string; classe: string }> = {
  PUBLISHED: { texto: 'No ar', classe: 'bg-emerald-500/10 text-emerald-700' },
  DRAFT: { texto: 'Rascunho', classe: 'bg-muted text-muted-foreground' },
  PAUSED: { texto: 'Pausado', classe: 'bg-amber-500/10 text-amber-700' },
};

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * A faixa de preço de um produto com tamanhos. Mostrar só o menor esconderia
 * o que o cliente realmente paga; mostrar só o maior assustaria sem motivo.
 */
export function faixaDePreco(produto: StoreProduct): string {
  if (produto.sizes.length === 0) {
    return produto.price === null ? 'Sem preço' : moeda(produto.price);
  }
  const precos = produto.sizes.map((tamanho) => tamanho.price);
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  return menor === maior ? moeda(menor) : `${moeda(menor)} a ${moeda(maior)}`;
}

/**
 * A mensagem que a API mandou, ou uma frase honesta quando ela não mandou
 * nenhuma. Na validação, a mensagem é só "Dados inválidos." — o que estava
 * inválido vem no primeiro item de `issues`, e é ele que diz o que corrigir.
 */
export function mensagemDoErro(erro: unknown, padrao: string): string {
  if (!(erro instanceof ApiError)) return padrao;
  const detalhe = erro.body?.issues?.[0]?.message;
  return detalhe && !erro.message.includes(detalhe) ? `${erro.message} ${detalhe}` : erro.message;
}

/** Move um item e devolve uma cópia do array. Fora do intervalo, a cópia sai igual. */
export function mover<T>(itens: readonly T[], de: number, para: number): T[] {
  if (para < 0 || para >= itens.length || de === para) return [...itens];
  const copia = [...itens];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item!);
  return copia;
}

/**
 * Os produtos na ordem do cardápio para uma ordem nova de categorias — a
 * mesma regra do servidor: pela ordem das categorias, e os sem categoria no
 * fim. Serve para a tela já mostrar a ordem nova antes de a API responder.
 */
export function ordenarPelasCategorias(
  produtos: StoreProduct[],
  categorias: StoreCategory[],
): StoreProduct[] {
  const ordem = new Map(categorias.map((categoria, indice) => [categoria.id, indice]));
  const ordemDe = (produto: StoreProduct) =>
    produto.categoryId === null
      ? categorias.length
      : (ordem.get(produto.categoryId) ?? categorias.length);
  return [...produtos].sort((a, b) => ordemDe(a) - ordemDe(b));
}

/**
 * O catálogo com o produto que a API acabou de devolver. Mesma categoria: fica
 * no lugar. Produto novo, ou que mudou de categoria: vai para o fim dela — é
 * onde o servidor o põe.
 */
export function comProdutoSalvo(catalogo: StoreCatalog, salvo: StoreProduct): StoreCatalog {
  const anterior = catalogo.products.find((produto) => produto.id === salvo.id);
  if (anterior && anterior.categoryId === salvo.categoryId) {
    return {
      ...catalogo,
      products: catalogo.products.map((produto) => (produto.id === salvo.id ? salvo : produto)),
    };
  }
  const outros = catalogo.products.filter((produto) => produto.id !== salvo.id);
  return {
    ...catalogo,
    products: ordenarPelasCategorias([...outros, salvo], catalogo.categories),
  };
}

export function semProduto(catalogo: StoreCatalog, id: string): StoreCatalog {
  return { ...catalogo, products: catalogo.products.filter((produto) => produto.id !== id) };
}

/**
 * A exclusão de um produto, marcada pelo id. A tela de edição consulta esta
 * chave para saber que o produto sumiu porque foi ela que o excluiu — e não
 * dizer "não encontrado" a quem acabou de apertar "Excluir".
 */
export function chaveDaExclusao(id: string) {
  return ['company', 'store', 'product-delete', id] as const;
}

/** Troca, no catálogo, os produtos de uma categoria pela lista nova — o resto fica. */
export function comProdutosReordenados(
  catalogo: StoreCatalog,
  categoryId: string | null,
  ids: string[],
): StoreCatalog {
  const porId = new Map(catalogo.products.map((produto) => [produto.id, produto]));
  const reordenados = ids.flatMap((id) => {
    const produto = porId.get(id);
    return produto ? [produto] : [];
  });
  const outros = catalogo.products.filter((produto) => produto.categoryId !== categoryId);
  return {
    ...catalogo,
    products: ordenarPelasCategorias([...outros, ...reordenados], catalogo.categories),
  };
}
