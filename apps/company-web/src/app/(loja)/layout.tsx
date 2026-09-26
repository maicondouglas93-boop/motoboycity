import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { MovimentoDaLoja } from '@/components/loja-online/movimento';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';

/**
 * O Clerk vale SÓ para a loja do cliente, e não para o painel.
 *
 * O `company-web` serve duas coisas muito diferentes no mesmo app: o painel
 * que as empresas e a central usam em produção, com autenticação própria
 * (`lib/session.ts`, JWT), e a loja pública, que é nova. O `clerk init` pôs o
 * `ClerkProvider` no layout raiz, o que colocaria uma segunda autenticação em
 * volta do painel que está rodando hoje — risco sem contrapartida nenhuma,
 * porque o painel não usa Clerk.
 *
 * Este grupo de rotas `(loja)` não aparece na URL: `/pedir/...`, `/sign-in` e
 * `/sign-up` continuam exatamente onde estavam. O que ele delimita é até onde
 * o Clerk vai. O matcher do `proxy.ts` acompanha esse mesmo recorte.
 *
 * O mesmo vale para a biblioteca de animação: ela só carrega aqui. O painel,
 * que não anima nada disso, não paga o peso dela.
 *
 * Sem a chave do Clerk, a loja abre sem conta (ver `lib/conta-da-loja.ts`).
 */
export default function LojaLayout({ children }: { children: ReactNode }) {
  const loja = <MovimentoDaLoja>{children}</MovimentoDaLoja>;
  if (!CONTA_DISPONIVEL) return loja;
  return <ClerkProvider localization={ptBR}>{loja}</ClerkProvider>;
}
