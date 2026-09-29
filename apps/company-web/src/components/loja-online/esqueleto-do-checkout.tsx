import type { Paleta } from '@/components/loja-online/paleta';

/**
 * O checkout enquanto ele chega: o cabeçalho de verdade (que é sempre o mesmo)
 * e espaços com a forma do que vem — o item, o total, as seções.
 *
 * Existe para o toque em "Continuar" não cair num vazio. Entre o toque e o
 * formulário há duas esperas: o servidor buscando a loja (`loading.tsx`) e o
 * navegador carregando o login do cliente. As duas mostram ESTA tela, para a
 * troca de uma para outra não piscar: só o que já é conhecido troca de cara.
 *
 * Sem hooks nem estado: o `loading.tsx` é de servidor, e aqui só entra o que
 * uma página estática também poderia mostrar.
 */
export function EsqueletoDoCheckout({
  paleta,
  corDaMarca,
}: {
  paleta: Paleta;
  corDaMarca: string;
}) {
  const bloco = (largura: string, altura = 'h-4') => (
    <div
      aria-hidden="true"
      className={`${largura} ${altura} rounded-md motion-safe:animate-pulse`}
      style={{ backgroundColor: paleta.linha }}
    />
  );

  return (
    <div
      className="min-h-dvh"
      style={{ backgroundColor: paleta.fundo, color: paleta.texto }}
      role="status"
    >
      <span className="sr-only">Abrindo a sacola…</span>
      <div className="h-1" style={{ backgroundColor: corDaMarca }} />

      <div className="mx-auto w-full max-w-lg">
        <header
          className="flex items-center gap-1 border-b px-2 py-2"
          style={{ borderColor: paleta.linha }}
        >
          <span aria-hidden="true" className="flex size-10 items-center justify-center">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-lg font-semibold">Finalizar pedido</p>
        </header>

        <div className="space-y-2.5 border-b px-4 py-4" style={{ borderColor: paleta.linha }}>
          {bloco('w-2/3', 'h-5')}
          {bloco('w-1/2')}
          {bloco('w-1/4', 'h-5')}
        </div>

        <div className="space-y-2 px-4 py-4">
          {bloco('w-full')}
          {bloco('w-full')}
          {bloco('w-1/3', 'h-5')}
        </div>

        {[0, 1].map((secao) => (
          <div
            key={secao}
            className="space-y-3 border-t px-4 py-5"
            style={{ borderColor: paleta.linha }}
          >
            {bloco('w-1/2', 'h-5')}
            {bloco('w-full', 'h-11')}
            {bloco('w-full', 'h-11')}
          </div>
        ))}
      </div>
    </div>
  );
}
