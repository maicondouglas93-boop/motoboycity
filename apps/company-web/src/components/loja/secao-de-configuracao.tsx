import type { ReactNode } from 'react';

/**
 * Um grupo de configurações que se leem juntas: o título e uma frase à
 * esquerda, os cartões à direita. Em tela estreita o título vai por cima.
 *
 * Existe para a página de Configurações não ser uma pilha de seis cartões do
 * mesmo peso: quem procura "onde muda o pagamento" acha o grupo pelo título, e
 * cada cartão continua gravando o seu.
 */
export function SecaoDeConfiguracao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t pt-6 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <header>
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </header>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
