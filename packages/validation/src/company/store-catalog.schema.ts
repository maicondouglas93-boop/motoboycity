import { z } from 'zod';
import { LIMITES_DO_COMBO } from './store-combo.rules';

/**
 * Catálogo da loja online: o que a empresa cadastra no painel.
 *
 * A ordem das listas é a ordem do cardápio. Não há campo de posição no
 * contrato: quem reordena manda a lista inteira, e o servidor renumera.
 */

export const storeProductStatusSchema = z.enum(['PUBLISHED', 'DRAFT', 'PAUSED']);

/** Produto, ou combo: vários produtos por um preço só. Escolhido ao criar, não muda depois. */
export const storeProductKindSchema = z.enum(['PRODUCT', 'COMBO']);

const idSchema = z.string().uuid('Identificador inválido.');

function nomeSchema(maximo: number) {
  return z
    .string()
    .trim()
    .min(1, 'Informe o nome.')
    .max(maximo, `Use no máximo ${maximo} caracteres.`);
}

/**
 * Reais com até dois decimais. A folga de 1e-6 é o erro de ponto flutuante:
 * 23.1 * 100 dá 2310.0000000000005, e isso não é um terceiro decimal.
 */
const precoSchema = z
  .number({ error: 'Informe o preço.' })
  .min(0, 'O preço não pode ser negativo.')
  .max(99999.99, 'Preço alto demais.')
  .refine(
    (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
    'Use no máximo dois decimais.',
  );

function semRepetidos(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

export const storeCategoryNameSchema = z.object({ name: nomeSchema(60) });

/** A ordem nova das categorias — todas elas, e nenhuma a mais. */
export const reorderStoreCategoriesSchema = z.object({
  ids: z.array(idSchema).max(200).refine(semRepetidos, 'Categoria repetida na lista.'),
});

/**
 * A ordem nova dos produtos de UMA categoria (ou dos sem categoria, com
 * `categoryId` nulo). Mudar produto de categoria não é reordenar: é editar o
 * produto.
 */
export const reorderStoreProductsSchema = z.object({
  categoryId: idSchema.nullable(),
  ids: z.array(idSchema).max(500).refine(semRepetidos, 'Produto repetido na lista.'),
});

/*
 * Nos itens do produto, `id` presente é um item que já existe e está sendo
 * mantido; ausente, um item novo. Guardar o mesmo id entre uma edição e outra
 * é o que deixa uma sacola montada antes da edição continuar apontando para a
 * escolha certa.
 */

export const storeProductSizeInputSchema = z.object({
  id: idSchema.optional(),
  name: nomeSchema(40),
  price: precoSchema,
  available: z.boolean(),
});

export const storeOptionInputSchema = z.object({
  id: idSchema.optional(),
  name: nomeSchema(60),
  price: precoSchema,
  available: z.boolean(),
});

export const storeOptionGroupInputSchema = z
  .object({
    id: idSchema.optional(),
    name: nomeSchema(60),
    minChoices: z.number().int().min(0).max(50),
    maxChoices: z.number().int().min(1).max(50).nullable(),
    options: z.array(storeOptionInputSchema).max(50),
  })
  .refine((grupo) => grupo.maxChoices === null || grupo.maxChoices >= grupo.minChoices, {
    message: 'O máximo não pode ser menor que o mínimo.',
    path: ['maxChoices'],
  });

/** Um produto do combo: qual, o tamanho fixo (se ele tem tamanhos) e quantas unidades. */
export const storeComboItemInputSchema = z.object({
  productId: idSchema,
  sizeId: idSchema.nullable(),
  quantity: z
    .number({ error: 'Informe a quantidade.' })
    .int('A quantidade é um número inteiro.')
    .min(1, 'A quantidade mínima é 1.')
    .max(
      LIMITES_DO_COMBO.quantidade,
      `Use no máximo ${LIMITES_DO_COMBO.quantidade} unidades de um item.`,
    ),
});

export const upsertStoreProductSchema = z
  .object({
    /**
     * Ausente é produto. Na edição tem de ser o mesmo tipo do que está gravado: o combo não vira
     * produto, nem o produto vira combo — outro tipo tem outras regras, e trocar apagaria o que a
     * loja montou.
     */
    kind: storeProductKindSchema.optional(),
    categoryId: idSchema.nullable(),
    name: nomeSchema(120),
    description: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
    // Sem `imageUrl`: a foto tem rotas próprias, e o endereço dela vem do
    // ImageKit pelo servidor. Aceitar um endereço qualquer aqui deixaria a
    // foto enviada esquecida lá, e o produto mostrando outra.
    /** Com tamanhos, é ignorado: o preço vem de cada tamanho. */
    price: precoSchema.nullable(),
    status: storeProductStatusSchema,
    /**
     * Quantas unidades a loja tem, ou `null` para não controlar. Ausente, o servidor não
     * mexe no que está gravado: quem edita sem falar de estoque não o apaga.
     */
    stock: z
      .number({ error: 'Informe o estoque como um número.' })
      .int('O estoque é um número inteiro.')
      .min(0, 'O estoque não pode ser negativo.')
      .max(999_999, 'Use no máximo 999.999 no estoque.')
      .nullable()
      .optional(),
    /** Só no combo: os produtos que ele leva, na ordem. O preço (`price`) é o do combo todo. */
    comboItems: z.array(storeComboItemInputSchema).max(LIMITES_DO_COMBO.itens).optional(),
    sizes: z.array(storeProductSizeInputSchema).max(20),
    optionGroups: z.array(storeOptionGroupInputSchema).max(20),
  })
  .superRefine((produto, ctx) => {
    const itensDoCombo = produto.comboItems ?? [];
    if (produto.kind === 'COMBO') {
      if (produto.comboItems === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Informe o que o combo leva.',
          path: ['comboItems'],
        });
      }
      if (produto.sizes.length > 0) {
        ctx.addIssue({ code: 'custom', message: 'O combo não tem tamanhos.', path: ['sizes'] });
      }
      if (produto.stock !== undefined && produto.stock !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'O combo não tem estoque próprio: vale o dos produtos que ele leva.',
          path: ['stock'],
        });
      }
      const pares = itensDoCombo.map((item) => `${item.productId}|${item.sizeId ?? ''}`);
      if (!semRepetidos(pares)) {
        ctx.addIssue({
          code: 'custom',
          message: 'O mesmo produto aparece duas vezes no combo. Aumente a quantidade.',
          path: ['comboItems'],
        });
      }
    } else if (itensDoCombo.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Só o combo leva itens.', path: ['comboItems'] });
    }

    const ids = [
      ...produto.sizes.map((tamanho) => tamanho.id),
      ...produto.optionGroups.map((grupo) => grupo.id),
      ...produto.optionGroups.flatMap((grupo) => grupo.options.map((escolha) => escolha.id)),
    ].filter((id): id is string => id !== undefined);
    if (!semRepetidos(ids)) {
      ctx.addIssue({ code: 'custom', message: 'Item repetido no produto.', path: ['sizes'] });
    }
  });

export const updateStoreProductStatusSchema = z.object({ status: storeProductStatusSchema });

export type StoreProductStatusValue = z.infer<typeof storeProductStatusSchema>;
export type StoreProductKindValue = z.infer<typeof storeProductKindSchema>;
export type StoreComboItemInput = z.infer<typeof storeComboItemInputSchema>;
export type StoreCategoryNamePayload = z.infer<typeof storeCategoryNameSchema>;
export type ReorderStoreCategoriesPayload = z.infer<typeof reorderStoreCategoriesSchema>;
export type ReorderStoreProductsPayload = z.infer<typeof reorderStoreProductsSchema>;
export type StoreProductSizeInput = z.infer<typeof storeProductSizeInputSchema>;
export type StoreOptionInput = z.infer<typeof storeOptionInputSchema>;
export type StoreOptionGroupInput = z.infer<typeof storeOptionGroupInputSchema>;
export type UpsertStoreProductPayload = z.infer<typeof upsertStoreProductSchema>;
export type UpdateStoreProductStatusPayload = z.infer<typeof updateStoreProductStatusSchema>;

/** O que `storeProductIssues` precisa saber do produto — sirva o payload ou o gravado. */
export interface StoreProductForIssues {
  /** Ausente: produto. */
  kind?: StoreProductKindValue;
  /** Só no combo. */
  comboItems?: ReadonlyArray<{ productId: string; sizeId: string | null; quantity: number }>;
  categoryId: string | null;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  sizes: ReadonlyArray<{ name: string; price: number; available: boolean }>;
  optionGroups: ReadonlyArray<{
    name: string;
    minChoices: number;
    options: ReadonlyArray<{ name: string; available: boolean }>;
  }>;
}

export interface StoreProductIssueResult {
  text: string;
  /** `true`: o cliente não consegue comprar. `false`: ficaria melhor assim. */
  blocking: boolean;
}

/** Um produto que o combo leva, como `storeProductIssues` precisa vê-lo para conferir o combo. */
export interface ComponenteParaCombo extends Omit<StoreProductForIssues, 'sizes'> {
  id: string;
  status: StoreProductStatusValue;
  sizes: ReadonlyArray<{ id: string; name: string; price: number; available: boolean }>;
}

/**
 * O que impede o combo de ir à venda por causa dos produtos que ele leva: o produto sumiu, está
 * pausado ou em rascunho, tem pendência que trava a compra, o tamanho fixo acabou ou foi
 * removido, ou passou a exigir escolhas (que um combo não tem como fixar). Tudo bloqueia: o
 * cliente pediria um combo que a loja não consegue montar.
 */
export function storeComboItemIssues(
  itens: NonNullable<StoreProductForIssues['comboItems']>,
  produtoPorId: ReadonlyMap<string, ComponenteParaCombo>,
): StoreProductIssueResult[] {
  const lista: StoreProductIssueResult[] = [];
  const bloqueia = (text: string) => lista.push({ text, blocking: true });

  for (const item of itens) {
    const produto = produtoPorId.get(item.productId);
    if (!produto) {
      bloqueia('um produto do combo foi removido do cardápio');
      continue;
    }
    const nome = `"${produto.name}"`;
    if (produto.kind === 'COMBO') {
      bloqueia(`${nome} é um combo, e um combo não leva outro combo`);
      continue;
    }
    if (produto.status !== 'PUBLISHED') {
      bloqueia(
        `${nome} ${produto.status === 'PAUSED' ? 'está pausado' : 'está em rascunho'} — o combo sai do ar enquanto isso`,
      );
      continue;
    }
    const pendencias = storeProductIssues(produto).filter((pendencia) => pendencia.blocking);
    if (pendencias.length > 0) {
      bloqueia(
        `${nome} tem pendência (${pendencias.map((pendencia) => pendencia.text).join('; ')})`,
      );
      continue;
    }
    if (produto.optionGroups.some((grupo) => grupo.minChoices >= 1)) {
      bloqueia(`${nome} exige escolhas do cliente, e um combo não tem como fixá-las`);
      continue;
    }
    if (produto.sizes.length > 0) {
      const tamanho = produto.sizes.find((candidato) => candidato.id === item.sizeId);
      if (!tamanho) bloqueia(`o tamanho escolhido de ${nome} foi removido`);
      else if (!tamanho.available) bloqueia(`o tamanho ${tamanho.name} de ${nome} acabou`);
    } else if (item.sizeId !== null) {
      bloqueia(`${nome} não tem mais tamanhos`);
    }
  }
  return lista;
}

/**
 * O que falta no cadastro do produto — a mesma lista que o painel mostra e que
 * o servidor usa para recusar publicar um produto que ninguém consegue comprar.
 *
 * Um lugar só para as duas pontas: com uma lista em cada, o painel deixaria
 * publicar o que o servidor recusa, ou o contrário.
 */
export function storeProductIssues(
  produto: StoreProductForIssues,
  /**
   * Os produtos da loja, por id: só o combo precisa, para conferir o que ele leva. Sem este
   * mapa, o combo é conferido só pelo que traz consigo (tem itens, tem preço).
   */
  produtoPorId?: ReadonlyMap<string, ComponenteParaCombo>,
): StoreProductIssueResult[] {
  const lista: StoreProductIssueResult[] = [];

  if (produto.name.trim() === '') lista.push({ text: 'sem nome', blocking: true });

  if (produto.kind === 'COMBO') {
    const itens = produto.comboItems ?? [];
    if (itens.length === 0) {
      lista.push({
        text: 'sem itens — o combo precisa levar pelo menos um produto',
        blocking: true,
      });
    } else if (produtoPorId) {
      lista.push(...storeComboItemIssues(itens, produtoPorId));
    }
  }

  if (produto.sizes.length === 0) {
    if (produto.price === null || produto.price <= 0) {
      lista.push({ text: 'sem preço', blocking: true });
    }
  } else {
    const semPreco = produto.sizes.filter((tamanho) => tamanho.price <= 0);
    if (semPreco.length > 0) {
      lista.push({
        text: `tamanho sem preço: ${semPreco.map((tamanho) => tamanho.name || 'sem nome').join(', ')}`,
        blocking: true,
      });
    }
    // Todos os tamanhos indisponíveis é o mesmo que produto sem preço: o
    // cliente abre, não tem o que escolher, e não fecha o pedido.
    if (produto.sizes.every((tamanho) => !tamanho.available)) {
      lista.push({
        text: 'nenhum tamanho disponível — o cliente não consegue escolher',
        blocking: true,
      });
    }
  }

  /*
   * A pendência mais séria, e a menos óbvia: um grupo obrigatório sem escolhas
   * disponíveis em número suficiente trava a compra. O produto aparece na loja
   * e simplesmente não dá para concluir o pedido.
   */
  for (const grupo of produto.optionGroups) {
    if (grupo.minChoices < 1) continue;
    const disponiveis = grupo.options.filter(
      (escolha) => escolha.available && escolha.name.trim() !== '',
    ).length;
    if (disponiveis < grupo.minChoices) {
      const plural = disponiveis === 1 ? 'disponível' : 'disponíveis';
      lista.push({
        text: `"${grupo.name}" exige ${grupo.minChoices} e só tem ${disponiveis} ${plural} — o cliente não fecha o pedido`,
        blocking: true,
      });
    }
  }

  // Bloqueia, e não é só recomendação: cada seção da loja é uma categoria, e
  // produto sem categoria não tem onde aparecer.
  if (produto.categoryId === null) {
    lista.push({ text: 'sem categoria — não aparece em nenhuma seção da loja', blocking: true });
  }
  if (produto.imageUrl === null) lista.push({ text: 'sem foto', blocking: false });
  if (produto.description.trim() === '') lista.push({ text: 'sem descrição', blocking: false });

  return lista;
}
