'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A loja não abriu: a API não respondeu, ou demorou demais. Sem esta página, o
 * cliente via o erro padrão, em inglês e sem saída — e ia embora achando que a
 * loja fechou. Aqui ele lê o que houve e tenta de novo, que é o que resolve na
 * maioria das vezes.
 *
 * "Tentar de novo" pede a página ao servidor outra vez: o erro aconteceu lá, e
 * só refazer a tela no navegador repetiria o mesmo erro.
 */
export default function LojaNaoAbriu({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  function tentarDeNovo() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-bold">A loja não abriu agora</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Não conseguimos carregar o cardápio. Pode ser a sua internet, ou o sistema demorando para
        responder.
      </p>
      <button
        type="button"
        onClick={tentarDeNovo}
        className="mx-auto mt-5 rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Tentar de novo
      </button>
    </main>
  );
}
