import type { StoreProduct, StoreProductKind, StoreProductStatus } from '@motoboycity/types';
import {
  LIMITES_DO_COMBO,
  storeProductIssues,
  type StoreProductForIssues,
  type StoreProductIssueResult,
  type UpsertStoreProductPayload,
} from '@motoboycity/validation';

/**
 * O produto como o formulário o edita, e a ida e a volta dele para a API.
 *
 * Os campos são texto porque é o que a lojista digita: "18,50", e não 18.5. A
 * conversão acontece num lugar só, na hora de salvar.
 *
 * Cada linha tem `chave`, para o React, e `id`, só quando o item já existe na
 * API. O `id` volta para o servidor na edição — é ele que mantém o tamanho e a
 * escolha com o mesmo id, e a sacola de quem montou o pedido antes da edição
 * continua apontando para o item certo. Linha nova vai sem `id`.
 */

export interface LinhaDeTamanho {
  chave: string;
  id?: string;
  nome: string;
  preco: string;
  disponivel: boolean;
}

export interface LinhaDeEscolha {
  chave: string;
  id?: string;
  nome: string;
  preco: string;
  disponivel: boolean;
}

export interface GrupoNoFormulario {
  chave: string;
  id?: string;
  nome: string;
  minimo: string;
  /** Vazio: sem limite. */
  maximo: string;
  escolhas: LinhaDeEscolha[];
}

/** Um produto que o combo leva. `tamanhoId` vazio: o produto não tem tamanhos. */
export interface LinhaDoCombo {
  chave: string;
  /** Vazio: a linha ainda não tem produto e não vai para a API. */
  produtoId: string;
  tamanhoId: string;
  quantidade: string;
}

export interface ProdutoNoFormulario {
  /** Combo ou produto: a loja escolhe ao criar, e não muda depois. */
  tipo: StoreProductKind;
  nome: string;
  descricao: string;
  /** Vazio: sem categoria. */
  categoriaId: string;
  imagemUrl: string | null;
  precoUnico: string;
  /**
   * Quantas unidades a loja tem. Vazio: sem controle de estoque, que é como o produto nasce.
   * O produto todo tem um estoque só: os tamanhos o dividem.
   */
  estoque: string;
  /**
   * O estoque como estava quando o formulário abriu — não se edita. O estoque anda sozinho
   * (cada pedido baixa, cada cancelamento devolve): quem abriu o produto para mudar o preço
   * e salvou dez minutos depois NÃO pode desfazer as vendas do meio. Só o estoque que a
   * lojista de fato mudou vai para a API; o resto o servidor deixa como está.
   */
  estoqueOriginal: string;
  tamanhos: LinhaDeTamanho[];
  grupos: GrupoNoFormulario[];
  /** Só no combo: o que ele leva. */
  itensDoCombo: LinhaDoCombo[];
}

/** Os mesmos limites de `upsertStoreProductSchema`: a tela para antes de a API recusar. */
export const LIMITES_DO_PRODUTO = {
  nome: 120,
  descricao: 500,
  nomeDoTamanho: 40,
  nomeDoGrupo: 60,
  nomeDaEscolha: 60,
  tamanhos: 20,
  grupos: 20,
  escolhasPorGrupo: 50,
  preco: 99999.99,
  estoque: 999_999,
  itensDoCombo: LIMITES_DO_COMBO.itens,
  quantidadeNoCombo: LIMITES_DO_COMBO.quantidade,
} as const;

/** O mesmo que a API aceita: ela confere de novo, pelos bytes. */
export const TAMANHO_MAXIMO_DA_FOTO = 5 * 1024 * 1024;
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * O que impede a foto de subir, dito antes do envio — esperar a API recusar
 * uma foto de 12 MB é esperar à toa, e a mensagem dela não diz o que fazer.
 */
export function problemaDaFoto(foto: { type: string; size: number }): string | null {
  if (!TIPOS_DE_FOTO.includes(foto.type)) return 'Use uma foto JPG, PNG ou WebP.';
  if (foto.size > TAMANHO_MAXIMO_DA_FOTO) {
    return 'A foto passa de 5 MB. Use uma menor — a do celular, reduzida, serve.';
  }
  return null;
}

export function novaChave(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Preço em número vira texto no padrão brasileiro. Sem isto, o campo mostraria
 * "18.5" para quem cadastrou "18,50" — e a lojista conclui, com razão, que o
 * sistema estragou o preço dela.
 */
export function precoParaTexto(valor: number | null): string {
  if (valor === null) return '';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * "18,50", "18.50", "R$ 1.234,50" → número. Vazio → `null`. O que não é valor
 * → `NaN`, para a tela dizer qual campo está errado.
 */
export function textoParaPreco(texto: string): number | null {
  let limpo = texto.replace(/R\$|\s/g, '');
  if (limpo === '') return null;
  // Com vírgula, ela é o decimal e os pontos são milhar ("1.234,50").
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return Number.NaN;
  return Number(limpo);
}

export function produtoParaFormulario(
  produto?: StoreProduct,
  /** O tipo de quem está sendo cadastrado. Quem edita tem o do produto. */
  tipo: StoreProductKind = 'PRODUCT',
): ProdutoNoFormulario {
  return {
    tipo: produto?.kind ?? tipo,
    itensDoCombo:
      produto?.comboItems.map((item, indice) => ({
        chave: `${item.productId}-${indice}`,
        produtoId: item.productId,
        tamanhoId: item.sizeId ?? '',
        quantidade: String(item.quantity),
      })) ?? [],
    nome: produto?.name ?? '',
    descricao: produto?.description ?? '',
    categoriaId: produto?.categoryId ?? '',
    imagemUrl: produto?.imageUrl ?? null,
    precoUnico: precoParaTexto(produto?.price ?? null),
    estoque: produto?.stock == null ? '' : String(produto.stock),
    estoqueOriginal: produto?.stock == null ? '' : String(produto.stock),
    tamanhos:
      produto?.sizes.map((tamanho) => ({
        chave: tamanho.id,
        id: tamanho.id,
        nome: tamanho.name,
        preco: precoParaTexto(tamanho.price),
        disponivel: tamanho.available,
      })) ?? [],
    grupos:
      produto?.optionGroups.map((grupo) => ({
        chave: grupo.id,
        id: grupo.id,
        nome: grupo.name,
        minimo: String(grupo.minChoices),
        maximo: grupo.maxChoices === null ? '' : String(grupo.maxChoices),
        escolhas: grupo.options.map((escolha) => ({
          chave: escolha.id,
          id: escolha.id,
          nome: escolha.name,
          preco: precoParaTexto(escolha.price),
          disponivel: escolha.available,
        })),
      })) ?? [],
  };
}

/** Clicou em "adicionar" e não preencheu nada: a linha não vai para o servidor. */
function emBranco(linha: { nome: string; preco: string }): boolean {
  return linha.nome.trim() === '' && linha.preco.trim() === '';
}

function grupoEmBranco(grupo: GrupoNoFormulario): boolean {
  return grupo.nome.trim() === '' && grupo.escolhas.every(emBranco);
}

function inteiro(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  return /^\d+$/.test(limpo) ? Number(limpo) : Number.NaN;
}

/** O preço digitado, ou `null` com o motivo anotado em `erros`. Vazio também é `null`. */
function lerPreco(texto: string, onde: string, erros: string[]): number | null {
  const valor = textoParaPreco(texto);
  if (valor === null) return null;
  if (Number.isNaN(valor)) {
    erros.push(`${onde}: "${texto.trim()}" não é um valor. Use, por exemplo, 22,00.`);
    return null;
  }
  if (valor > LIMITES_DO_PRODUTO.preco) {
    erros.push(`${onde}: o valor passa do máximo, R$ 99.999,99.`);
    return null;
  }
  return valor;
}

export type Montagem =
  { ok: true; payload: UpsertStoreProductPayload } | { ok: false; erros: string[] };

/**
 * O formulário vira o que a API recebe — ou a lista do que impede SALVAR.
 *
 * Impedir de salvar é diferente de impedir de publicar. Rascunho aceita o
 * trabalho pela metade: tamanho sem preço vai com zero e vira pendência de
 * publicação, e não erro. O que não passa é o que a API não tem como guardar:
 * produto sem nome, item com preço e sem nome, número que não é número.
 *
 * Com a tabela de tamanhos aberta, o preço único não vai, mesmo que as linhas
 * estejam em branco: é o que a tela mostra, e o que se vê é o que se salva.
 */
export function montarPayload(
  estado: ProdutoNoFormulario,
  status: StoreProductStatus,
  /** O catálogo: o combo confere, por ele, se o produto pede tamanho. */
  produtos: readonly StoreProduct[] = [],
): Montagem {
  const erros: string[] = [];
  const combo = estado.tipo === 'COMBO';
  const nome = estado.nome.trim();
  if (nome === '') erros.push(combo ? 'Dê um nome ao combo.' : 'Dê um nome ao produto.');

  // O combo tem um preço só — o dele —, sem tamanhos e sem estoque próprio.
  const usaTamanhos = !combo && estado.tamanhos.length > 0;
  const price = usaTamanhos
    ? null
    : lerPreco(estado.precoUnico, combo ? 'Preço do combo' : 'Preço', erros);

  const comboItems = combo ? lerItensDoCombo(estado.itensDoCombo, produtos, erros) : [];

  // O estoque só vai se a lojista o mudou: ver `estoqueOriginal`.
  const estoqueMudou = !combo && estado.estoque.trim() !== estado.estoqueOriginal.trim();
  let stock: number | null = null;
  if (estoqueMudou) {
    const valor = inteiro(estado.estoque);
    if (valor !== null && Number.isNaN(valor)) {
      erros.push(
        `Estoque: "${estado.estoque.trim()}" não é um número inteiro. Deixe vazio para não controlar.`,
      );
    } else if (valor !== null && valor > LIMITES_DO_PRODUTO.estoque) {
      erros.push('Estoque: o valor passa do máximo, 999.999.');
    } else {
      stock = valor;
    }
  }

  const sizes = (combo ? [] : estado.tamanhos)
    .filter((linha) => !emBranco(linha))
    .map((linha) => {
      if (linha.nome.trim() === '') erros.push('Um tamanho tem preço, mas está sem nome.');
      const valor = lerPreco(linha.preco, `Tamanho "${linha.nome.trim()}"`, erros);
      return {
        ...(linha.id ? { id: linha.id } : {}),
        name: linha.nome.trim(),
        price: valor ?? 0,
        available: linha.disponivel,
      };
    });

  const optionGroups = estado.grupos
    .filter((grupo) => !grupoEmBranco(grupo))
    .map((grupo) => {
      const rotulo = grupo.nome.trim() || 'grupo sem nome';
      if (grupo.nome.trim() === '') erros.push('Um grupo de escolhas está sem nome.');

      const minimo = inteiro(grupo.minimo) ?? 0;
      const maximo = inteiro(grupo.maximo);
      const teto = LIMITES_DO_PRODUTO.escolhasPorGrupo;
      if (Number.isNaN(minimo) || (maximo !== null && Number.isNaN(maximo))) {
        erros.push(`Em "${rotulo}", mínimo e máximo têm de ser números inteiros.`);
      } else if (minimo > teto || (maximo !== null && maximo > teto)) {
        erros.push(`Em "${rotulo}", mínimo e máximo vão até ${teto}.`);
      } else if (maximo !== null && maximo < 1) {
        erros.push(
          `Em "${rotulo}", o máximo tem de ser pelo menos 1 — ou fique vazio, sem limite.`,
        );
      } else if (maximo !== null && maximo < minimo) {
        erros.push(`Em "${rotulo}", o máximo é menor que o mínimo.`);
      }

      const options = grupo.escolhas
        .filter((escolha) => !emBranco(escolha))
        .map((escolha) => {
          if (escolha.nome.trim() === '') {
            erros.push(`Em "${rotulo}", uma escolha tem preço, mas está sem nome.`);
          }
          const valor = lerPreco(escolha.preco, `Escolha "${escolha.nome.trim()}"`, erros);
          return {
            ...(escolha.id ? { id: escolha.id } : {}),
            name: escolha.nome.trim(),
            // Escolha sem preço é de graça — é o caso de "ao ponto", "sem cebola".
            price: valor ?? 0,
            available: escolha.disponivel,
          };
        });

      return {
        ...(grupo.id ? { id: grupo.id } : {}),
        name: grupo.nome.trim(),
        minChoices: Number.isNaN(minimo) ? 0 : minimo,
        maxChoices: maximo === null || Number.isNaN(maximo) ? null : maximo,
        options,
      };
    });

  if (erros.length > 0) return { ok: false, erros: [...new Set(erros)] };

  return {
    ok: true,
    payload: {
      ...(combo ? { kind: 'COMBO' as const, comboItems } : {}),
      categoryId: estado.categoriaId === '' ? null : estado.categoriaId,
      name: nome,
      description: estado.descricao.trim(),
      price,
      status,
      ...(estoqueMudou ? { stock } : {}),
      sizes,
      optionGroups,
    },
  };
}

/**
 * As linhas do combo como a API as recebe. A linha sem produto é a que se clicou em "adicionar"
 * e não preencheu: não vai. Produto com tamanhos precisa do tamanho; quantidade é inteiro de 1 até
 * o limite.
 */
function lerItensDoCombo(
  linhas: readonly LinhaDoCombo[],
  produtos: readonly StoreProduct[],
  erros: string[],
): Array<{ productId: string; sizeId: string | null; quantity: number }> {
  return linhas
    .filter((linha) => linha.produtoId !== '')
    .map((linha) => {
      const produto = produtos.find((candidato) => candidato.id === linha.produtoId);
      const nome = produto?.name ?? 'um produto';
      if (!produto) erros.push('Um produto do combo não está mais no cardápio. Tire-o da lista.');
      const quantidade = inteiro(linha.quantidade);
      if (
        quantidade === null ||
        Number.isNaN(quantidade) ||
        quantidade < 1 ||
        quantidade > LIMITES_DO_PRODUTO.quantidadeNoCombo
      ) {
        erros.push(
          `Combo: a quantidade de ${nome} é um número inteiro de 1 a ${LIMITES_DO_PRODUTO.quantidadeNoCombo}.`,
        );
      }
      const comTamanhos = (produto?.sizes.length ?? 0) > 0;
      if (comTamanhos && linha.tamanhoId === '')
        erros.push(`Escolha o tamanho de ${nome} no combo.`);
      return {
        productId: linha.produtoId,
        sizeId: comTamanhos ? linha.tamanhoId : null,
        quantity: quantidade !== null && !Number.isNaN(quantidade) ? quantidade : 1,
      };
    });
}

/**
 * O que impede PUBLICAR, pela mesma regra do servidor (`storeProductIssues`).
 *
 * Tolerante de propósito: é chamada a cada tecla, com o formulário pela metade.
 * O que não é número conta como sem preço — que é exatamente a pendência.
 */
export function pendenciasDoFormulario(
  estado: ProdutoNoFormulario,
  /** O catálogo: o combo é conferido pelo que leva (à venda, com o tamanho disponível). */
  produtos: readonly StoreProduct[] = [],
): StoreProductIssueResult[] {
  const comoPreco = (texto: string) => {
    const valor = textoParaPreco(texto);
    return valor === null || Number.isNaN(valor) ? null : valor;
  };
  const combo = estado.tipo === 'COMBO';
  const produto: StoreProductForIssues = {
    ...(combo
      ? {
          kind: 'COMBO' as const,
          comboItems: estado.itensDoCombo
            .filter((linha) => linha.produtoId !== '')
            .map((linha) => ({
              productId: linha.produtoId,
              sizeId: linha.tamanhoId === '' ? null : linha.tamanhoId,
              quantity: Math.max(1, Number(linha.quantidade) || 1),
            })),
        }
      : {}),
    categoryId: estado.categoriaId === '' ? null : estado.categoriaId,
    name: estado.nome,
    description: estado.descricao,
    imageUrl: estado.imagemUrl,
    price: !combo && estado.tamanhos.length > 0 ? null : comoPreco(estado.precoUnico),
    sizes: (combo ? [] : estado.tamanhos)
      .filter((linha) => !emBranco(linha))
      .map((linha) => ({
        name: linha.nome,
        price: comoPreco(linha.preco) ?? 0,
        available: linha.disponivel,
      })),
    optionGroups: estado.grupos
      .filter((grupo) => !grupoEmBranco(grupo))
      .map((grupo) => ({
        name: grupo.nome,
        minChoices: Math.max(0, Number(grupo.minimo) || 0),
        options: grupo.escolhas
          .filter((escolha) => !emBranco(escolha))
          .map((escolha) => ({ name: escolha.nome, available: escolha.disponivel })),
      })),
  };
  return storeProductIssues(
    produto,
    combo ? new Map(produtos.map((item) => [item.id, item])) : undefined,
  );
}

export interface SaidaDoFormulario {
  /** A situação com que o produto é gravado. */
  status: StoreProductStatus;
  texto: string;
  variante: 'default' | 'outline' | 'destructive';
  /** Publicar com pendência que impede vender — o servidor recusaria. */
  desativada: boolean;
}

/**
 * Os botões de salvar, conforme a situação do produto e as pendências.
 *
 * O caso delicado é o produto NO AR que a edição deixou sem poder ser
 * comprado. Impedir de salvar prenderia o trabalho pela metade; salvar e
 * manter no ar entregaria ao cliente um produto quebrado (e o servidor
 * recusaria). Ele volta a rascunho, e o botão diz isso antes do clique.
 *
 * Pausado continua pausado ao salvar: pausar é decisão da loja ("acabou
 * hoje"), e editar a descrição não deve pô-lo à venda sem ela pedir.
 */
export function saidasDoFormulario(
  atual: StoreProductStatus | undefined,
  bloqueado: boolean,
  /** "produto" ou "combo": é o que o botão de publicar diz. */
  substantivo: 'produto' | 'combo' = 'produto',
): SaidaDoFormulario[] {
  switch (atual) {
    case undefined:
      return [
        {
          status: 'PUBLISHED',
          texto: `Publicar ${substantivo}`,
          variante: 'default',
          desativada: bloqueado,
        },
        { status: 'DRAFT', texto: 'Salvar rascunho', variante: 'outline', desativada: false },
      ];
    case 'PUBLISHED':
      return bloqueado
        ? [
            {
              status: 'DRAFT',
              texto: 'Salvar e tirar do ar',
              variante: 'destructive',
              desativada: false,
            },
          ]
        : [
            {
              status: 'PUBLISHED',
              texto: 'Salvar alterações',
              variante: 'default',
              desativada: false,
            },
          ];
    case 'DRAFT':
      return [
        {
          status: 'PUBLISHED',
          texto: 'Salvar e publicar',
          variante: 'default',
          desativada: bloqueado,
        },
        { status: 'DRAFT', texto: 'Salvar rascunho', variante: 'outline', desativada: false },
      ];
    case 'PAUSED':
      return [
        { status: 'PAUSED', texto: 'Salvar alterações', variante: 'default', desativada: false },
        {
          status: 'PUBLISHED',
          texto: 'Salvar e voltar a vender',
          variante: 'outline',
          desativada: bloqueado,
        },
      ];
  }
}
