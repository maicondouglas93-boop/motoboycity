import { cache } from 'react';
import { ApiError, createPublicStoreApi } from '@motoboycity/api-client';
import type {
  EnderecoDeRetirada,
  OperacaoPublica,
  PublicStore,
  PublicStoreProduct,
} from '@motoboycity/types';
import {
  CATEGORIAS_DE_EXEMPLO,
  LOJA_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  type CategoriaDeExemplo,
  type ProdutoDeExemplo,
} from '@/lib/loja-mock';
import type { TemaDaLoja } from '@/lib/contraste';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';

/**
 * De onde a página do cliente tira a loja: do banco, pelo link, ou da
 * demonstração, no link reservado a ela.
 *
 * A loja de verdade recebe pedido quando ela liga os pedidos pela página e o
 * login do cliente está configurado neste deploy; sem as duas coisas, abre
 * como VITRINE: o cardápio, o horário e a situação, sem pedido. A
 * demonstração segue com o fluxo inteiro no `localStorage`, para mostrar como
 * é.
 *
 * Roda no servidor: a página chega pronta, e o link antigo redireciona antes
 * de o navegador baixar qualquer coisa.
 *
 * Uma consulta por requisição: o título da aba, a cor da barra e a página
 * pedem a mesma loja, e o `cache` do React junta as três numa chamada só à
 * API — sem ele, cada abertura da loja custava três.
 */

export const LINK_DA_DEMONSTRACAO = LOJA_DE_EXEMPLO.slug;

const lojas = createPublicStoreApi({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3333',
});

export interface IdentidadeDaLoja {
  nome: string;
  tema: TemaDaLoja;
  corDaMarca: string;
  corDeAcao: string;
  logoUrl: string | null;
}

export interface CardapioDaPagina {
  /** Mostra o cardápio, e não recebe pedido. */
  vitrine: boolean;
  identidade: IdentidadeDaLoja;
  categorias: CategoriaDeExemplo[];
  produtos: ProdutoDeExemplo[];
  /**
   * Como a loja funciona, do banco. `null` na demonstração, que segue a
   * configuração do `localStorage` — a mesma que o painel copia para lá.
   */
  operacao: OperacaoPublica | null;
  /** Onde o cliente retira: o endereço que a loja escolheu, ou o da empresa. */
  enderecoDeRetirada: EnderecoDeRetirada | null;
}

export type LojaDoLink =
  | { tipo: 'loja'; cardapio: CardapioDaPagina }
  | { tipo: 'mudou'; slug: string }
  | { tipo: 'nao-existe' };

/** A identidade que a loja escolheu em Configurações, no formato da página. */
function identidade(loja: PublicStore): IdentidadeDaLoja {
  return {
    nome: loja.name,
    tema: loja.identity.theme,
    corDaMarca: loja.identity.brandColor,
    corDeAcao: loja.identity.actionColor,
    logoUrl: loja.identity.logoUrl,
  };
}

/** O produto da API no formato que a página e a folha do produto já usam. */
export function produtoDaVitrine(produto: PublicStoreProduct): ProdutoDeExemplo {
  return {
    id: produto.id,
    nome: produto.name,
    descricao: produto.description,
    categoriaId: produto.categoryId,
    imagemUrl: produto.imageUrl,
    precoUnico: produto.price,
    situacao: 'publicado',
    tamanhos: produto.sizes.map((tamanho) => ({
      id: tamanho.id,
      nome: tamanho.name,
      preco: tamanho.price,
      disponivel: tamanho.available,
    })),
    grupos: produto.optionGroups.map((grupo) => ({
      id: grupo.id,
      nome: grupo.name,
      minimo: grupo.minChoices,
      maximo: grupo.maxChoices,
      escolhas: grupo.options.map((escolha) => ({
        id: escolha.id,
        nome: escolha.name,
        preco: escolha.price,
        disponivel: escolha.available,
      })),
    })),
  };
}

export const lojaDoLink = cache(async function lojaDoLink(slug: string): Promise<LojaDoLink> {
  if (slug === LINK_DA_DEMONSTRACAO) {
    return {
      tipo: 'loja',
      cardapio: {
        vitrine: false,
        identidade: {
          nome: LOJA_DE_EXEMPLO.nome,
          tema: LOJA_DE_EXEMPLO.tema,
          corDaMarca: LOJA_DE_EXEMPLO.corDaMarca,
          corDeAcao: LOJA_DE_EXEMPLO.corDeAcao,
          logoUrl: null,
        },
        categorias: CATEGORIAS_DE_EXEMPLO,
        produtos: PRODUTOS_DE_EXEMPLO,
        operacao: null,
        enderecoDeRetirada: LOJA_DE_EXEMPLO.pontoDeColeta,
      },
    };
  }

  try {
    const achado = await lojas.store(slug, { cache: 'no-store' });
    if (achado.kind === 'moved') return { tipo: 'mudou', slug: achado.slug };
    // O link escrito com maiúscula acha a mesma loja: vai para o endereço certo.
    if (achado.store.slug !== slug) return { tipo: 'mudou', slug: achado.store.slug };
    return {
      tipo: 'loja',
      cardapio: {
        vitrine: !(achado.store.recebePedidos && CONTA_DISPONIVEL),
        identidade: identidade(achado.store),
        categorias: achado.store.categories.map(({ id, name }) => ({ id, nome: name })),
        produtos: achado.store.products.map(produtoDaVitrine),
        operacao: achado.store.operacao,
        enderecoDeRetirada: achado.store.enderecoDeRetirada,
      },
    };
  } catch (erro) {
    // 400 é link que nunca seria de loja; 404, link sem loja (ou loja fora do ar).
    if (erro instanceof ApiError && (erro.status === 404 || erro.status === 400)) {
      return { tipo: 'nao-existe' };
    }
    throw erro;
  }
});

/** Só a identidade, para o título, o manifest e o ícone. `null`: link sem loja. */
export async function identidadeDoLink(slug: string): Promise<IdentidadeDaLoja | null> {
  const achado = await lojaDoLink(slug);
  return achado.tipo === 'loja' ? achado.cardapio.identidade : null;
}
