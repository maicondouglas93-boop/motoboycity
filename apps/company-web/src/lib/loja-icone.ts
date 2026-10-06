import type { IdentidadeDaLoja } from './loja-publica';

/**
 * O ícone da loja (aba do navegador, tela inicial do celular) a partir do logo
 * enviado na Configurações.
 *
 * O logo vem do ImageKit em JPEG, PNG ou WebP e em qualquer proporção. O
 * gerador de imagem do Next não desenha WebP, então quem entrega o ícone é o
 * próprio ImageKit: quadrado, no tamanho pedido, em PNG. O recorte é o mesmo do
 * cabeçalho da página (o miolo do logo, preenchendo o quadrado) — o cliente vê
 * na aba a mesma marca que vê no topo da loja.
 */

const TEMPO_MAXIMO_MS = 5_000;

/**
 * Endereço do logo já quadrado, em PNG, no lado pedido — ou `null` se o logo
 * não está no ImageKit.
 *
 * Só ImageKit, e só HTTPS: o servidor busca esta imagem, e um endereço
 * qualquer gravado no banco não pode virar uma requisição do servidor para
 * onde ele apontar.
 */
export function urlDoLogoQuadrado(logoUrl: string, lado: number): string | null {
  let url: URL;
  try {
    url = new URL(logoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'ik.imagekit.io') return null;

  // Largura e altura iguais com `maintain_ratio` cortam pelo centro, como o
  // `object-cover` do cabeçalho.
  url.searchParams.set('tr', `w-${lado},h-${lado},c-maintain_ratio,f-png`);
  return url.toString();
}

/** O PNG quadrado do logo, ou `null` se não deu para buscar — aí vale a inicial. */
export async function logoQuadradoEmPng(
  logoUrl: string,
  lado: number,
): Promise<ArrayBuffer | null> {
  const endereco = urlDoLogoQuadrado(logoUrl, lado);
  if (!endereco) return null;
  try {
    const resposta = await fetch(endereco, { signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
    if (!resposta.ok || resposta.headers.get('content-type') !== 'image/png') return null;
    return await resposta.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Marca de versão para o endereço do ícone.
 *
 * O ícone fica em cache por um dia — no navegador, e a aba guarda o seu por
 * conta própria. Sem isto, a loja que acabou de enviar o logo continuaria vendo
 * a inicial. A versão muda com o que desenha o ícone: o logo (cada envio ganha
 * um arquivo novo no ImageKit), a cor e a inicial.
 */
export function versaoDoIcone(loja: Pick<IdentidadeDaLoja, 'logoUrl' | 'corDaMarca' | 'nome'>) {
  const base = `${loja.logoUrl ?? ''}|${loja.corDaMarca}|${loja.nome.charAt(0).toUpperCase()}`;
  // djb2: curto, estável e suficiente para distinguir versões da mesma loja.
  let hash = 5381;
  for (let i = 0; i < base.length; i += 1) {
    hash = ((hash << 5) + hash + base.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
