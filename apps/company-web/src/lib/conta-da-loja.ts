/**
 * Se a conta do cliente da loja (Clerk) está disponível neste deploy.
 *
 * Sem a chave, o Clerk quebra a página inteira — e a vitrine não precisa de
 * conta nenhuma: ver o cardápio não exige login, só pedir. Então a loja abre
 * sem conta até a chave existir, em vez de não abrir.
 *
 * Lida no build: o Next troca `NEXT_PUBLIC_*` pelo valor. Pôr a chave pede um
 * deploy novo.
 */
export const CONTA_DISPONIVEL = Boolean(process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']);
