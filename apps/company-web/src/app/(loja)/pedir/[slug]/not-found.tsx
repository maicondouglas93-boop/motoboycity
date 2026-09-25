/**
 * Link sem loja, ou de loja que não está no ar. Quem chega aqui abriu um link
 * que alguém mandou — a página padrão, em inglês e sem saída, não diz o que
 * fazer. Esta diz.
 */
export default function LojaNaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Loja não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confira o endereço com a loja: ele pode ter mudado, ou a loja ainda não está no ar.
      </p>
    </main>
  );
}
