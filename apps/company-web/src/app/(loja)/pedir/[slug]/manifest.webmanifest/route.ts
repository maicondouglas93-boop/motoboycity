import { fundoDoTema } from '@/lib/contraste';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * O manifest de UMA loja — o que o celular usa quando o cliente a instala.
 *
 * Por loja, e não um só para o site: cada loja instalada é um app separado no
 * celular, com o nome e a cor dela. É aqui que vale a promessa da tela de
 * Configurações — a cor da marca vira a barra do navegador e a tela de
 * abertura.
 *
 * `id` distinto por loja é o que impede o celular de achar que instalar a
 * segunda loja é atualizar a primeira.
 *
 * Nesta demonstração toda loja responde com os dados de exemplo; com backend,
 * a loja vem do `slug`.
 */
export async function GET(_pedido: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loja = LOJA_DE_EXEMPLO;
  const base = `/pedir/${slug}`;

  const manifest = {
    id: base,
    name: loja.nome,
    short_name: loja.nome,
    description: `Peça na ${loja.nome}.`,
    lang: 'pt-BR',
    start_url: base,
    // Sem barra no fim, igual ao service worker: ver o comentário em
    // public/loja-sw.js sobre por que a barra tiraria a própria página do app.
    scope: base,
    display: 'standalone',
    theme_color: loja.corDaMarca,
    background_color: fundoDoTema(loja.tema),
    icons: [
      { src: `${base}/icone/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icone/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O mesmo desenho serve como "maskable": a letra ocupa o miolo, dentro da
      // área que os lançadores do Android nunca recortam.
      { src: `${base}/icone/512`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
