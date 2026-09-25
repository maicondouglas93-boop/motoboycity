import { ImageResponse } from 'next/og';
import { textoSobre } from '@/lib/contraste';
import { identidadeDoLink } from '@/lib/loja-publica';

/**
 * O ícone da loja na tela inicial do celular, gerado com a inicial e a cor da
 * marca.
 *
 * Gerado, e não um arquivo: a maioria das lojas não vai ter um ícone quadrado
 * pronto no tamanho que o Android e o iPhone pedem. Quando houver logo enviado
 * na Configurações, é ele que entra aqui.
 *
 * Só os três tamanhos que o manifest e o iPhone pedem. Aceitar qualquer número
 * faria este endereço gerar imagens de tamanho arbitrário para quem pedisse.
 */
const TAMANHOS = new Set([180, 192, 512]);

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ slug: string; tamanho: string }> },
) {
  const { slug, tamanho } = await params;
  const lado = Number(tamanho);
  if (!TAMANHOS.has(lado)) {
    return new Response('Tamanho não suportado', { status: 404 });
  }

  const loja = await identidadeDoLink(slug);
  if (!loja) return new Response('Loja não encontrada', { status: 404 });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: loja.corDaMarca,
        color: textoSobre(loja.corDaMarca),
        // A letra em metade do lado fica dentro do círculo central de 80%,
        // que é o que os ícones "maskable" do Android garantem mostrar.
        fontSize: Math.round(lado * 0.5),
        fontWeight: 700,
      }}
    >
      {loja.nome.charAt(0).toUpperCase()}
    </div>,
    {
      width: lado,
      height: lado,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    },
  );
}
