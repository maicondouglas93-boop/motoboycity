import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Sem as duas chaves, o middleware do Clerk derruba toda requisição da loja —
 * inclusive a vitrine, que não precisa de conta. Aí ele não roda.
 */
const clerkConfigurado = Boolean(
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] && process.env['CLERK_SECRET_KEY'],
);

export default clerkConfigurado ? clerkMiddleware() : () => NextResponse.next();

/**
 * Restrito à loja, e não ao app inteiro.
 *
 * O matcher que o `clerk init` gera cobre tudo o que não for arquivo estático.
 * Neste app isso incluiria `/pedidos`, `/clientes`, `/financeiro` e o resto do
 * painel que as empresas usam em produção — que autentica por conta própria
 * (`lib/session.ts`) e não tem nada a ver com o Clerk. Rodar um segundo
 * middleware de autenticação por cima dele é risco sem contrapartida.
 *
 * `/__clerk` é o caminho do proxy automático do Clerk e precisa continuar
 * passando, senão o handshake não fecha.
 */
export const config = {
  matcher: ['/pedir/:path*', '/sign-in/:path*', '/sign-up/:path*', '/__clerk/:path*'],
};
