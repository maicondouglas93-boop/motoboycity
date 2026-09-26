import type { ReactNode } from 'react';
import { MovimentoDaLoja } from '@/components/loja-online/movimento';

/**
 * O que vale SÓ para a loja do cliente, e não para o painel.
 *
 * O `company-web` serve duas coisas muito diferentes no mesmo app: o painel
 * que as empresas e a central usam em produção, com autenticação própria
 * (`lib/session.ts`, JWT), e a loja pública. Este grupo de rotas `(loja)` não
 * aparece na URL — `/pedir/...` continua onde estava —, e delimita até onde vai
 * o que é da loja.
 *
 * A biblioteca de animação só carrega aqui: o painel, que não anima nada
 * disso, não paga o peso dela. O login do cliente (Firebase, com Google) não
 * precisa de provedor em volta da página: `components/loja-online/conta.tsx`
 * assina o estado da conta direto.
 */
export default function LojaLayout({ children }: { children: ReactNode }) {
  return <MovimentoDaLoja>{children}</MovimentoDaLoja>;
}
