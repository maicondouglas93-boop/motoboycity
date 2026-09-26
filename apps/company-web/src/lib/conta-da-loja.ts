/**
 * A conta do cliente da loja: o login do Firebase, só com Google.
 *
 * É o mesmo projeto do Firebase que o push do aplicativo do motoboy já usa, e
 * funciona no endereço `.vercel.app` — o Clerk, usado antes, exigia um domínio
 * próprio em produção. A API confere o token com a configuração que já tem.
 *
 * Os quatro valores são a configuração do app web cadastrado no console do
 * Firebase. São públicos por natureza (vão para o navegador de todo cliente);
 * o que protege a conta é a lista de domínios autorizados no console.
 *
 * Sem eles, a loja abre sem conta: ver o cardápio não exige login, só pedir.
 * Lidos no build — o Next troca `NEXT_PUBLIC_*` pelo valor, e pôr a
 * configuração pede um deploy novo.
 */
export const CONFIGURACAO_DO_FIREBASE = {
  apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ?? '',
  authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ?? '',
  projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? '',
  appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] ?? '',
};

export const CONTA_DISPONIVEL = Object.values(CONFIGURACAO_DO_FIREBASE).every(Boolean);
