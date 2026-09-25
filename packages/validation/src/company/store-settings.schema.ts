import { z } from 'zod';

/**
 * O link da loja online: `pedidos.motoboycity.com.br/<slug>`.
 *
 * É o que a loja imprime no panfleto e põe no QR da mesa, por isso as regras
 * são de endereço, e não de nome: minúsculas sem acento, números e hífen.
 */

const PADRAO_DO_LINK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Endereços que não podem ser de loja nenhuma: rotas do sistema, ou que um dia
 * serão, e o da loja de demonstração.
 */
const RESERVADOS = new Set([
  'admin',
  'ajuda',
  'api',
  'app',
  'entrar',
  'login',
  'loja',
  'lojas',
  'minha-loja',
  'motoboycity',
  'pedido',
  'pedidos',
  'pedir',
  'politica-de-privacidade',
  'sign-in',
  'sign-up',
  'suporte',
  'termos-de-uso',
  'www',
]);

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use pelo menos 3 caracteres.')
  .max(40, 'Use no máximo 40 caracteres.')
  .regex(
    PADRAO_DO_LINK,
    'Use só letras sem acento, números e hífen — sem espaço, e sem hífen no começo ou no fim.',
  )
  .refine((slug) => !RESERVADOS.has(slug), 'Este endereço é reservado. Escolha outro.');

export const updateStoreLinkSchema = z.object({
  slug: storeSlugSchema,
  name: z.string().trim().min(2, 'Informe o nome da loja.').max(80, 'Use no máximo 80 caracteres.'),
});

/**
 * O link procurado na rota pública. Mais frouxo que o de salvar — um link
 * reservado só não existe —, mas barra o que nunca seria link antes de ir ao
 * banco.
 */
export const storeSlugLookupSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,40}$/, 'Link inválido.');

export type UpdateStoreLinkPayload = z.infer<typeof updateStoreLinkSchema>;

/**
 * A sugestão de link a partir do nome: "Açaí do Centro" → "acai-do-centro".
 * Vazia quando o nome não tem nada aproveitável — a tela pede para digitar.
 */
export function suggestStoreSlug(nome: string): string {
  let slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  if (slug.length > 0 && slug.length < 3) slug = `${slug}-loja`;
  if (RESERVADOS.has(slug)) slug = `${slug}-oficial`;
  return slug;
}
