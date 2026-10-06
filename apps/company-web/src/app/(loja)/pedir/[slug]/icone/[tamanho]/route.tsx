import { ImageResponse } from 'next/og';
import { textoSobre } from '@/lib/contraste';
import { logoQuadradoEmPng } from '@/lib/loja-icone';
import { identidadeDoLink } from '@/lib/loja-publica';

/**
 * O ícone da loja na aba do navegador e na tela inicial do celular.
 *
 * Com logo enviado na Configurações, é o logo, recortado em quadrado pelo
 * ImageKit (ver `loja-icone.ts`). Sem logo — ou se o ImageKit não responder —,
 * é gerado com a inicial e a cor da marca: a maioria das lojas não tem um
 * ícone quadrado pronto no tamanho que o Android e o iPhone pedem.
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

  const logo = loja.logoUrl ? await logoQuadradoEmPng(loja.logoUrl, lado) : null;
  if (logo) {
    return new Response(logo, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  }

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
