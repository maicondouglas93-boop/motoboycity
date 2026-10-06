import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoQuadradoEmPng, urlDoLogoQuadrado, versaoDoIcone } from './loja-icone';

const mocks = vi.hoisted(() => ({ identidadeDoLink: vi.fn() }));

vi.mock('@/lib/loja-publica', () => ({ identidadeDoLink: mocks.identidadeDoLink }));
// O gerador de imagem precisa de WebAssembly; aqui basta saber que foi chamado.
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor() {
      super('inicial', { headers: { 'Content-Type': 'image/png', 'X-Teste': 'inicial' } });
    }
  },
}));

const { GET } = await import('@/app/(loja)/pedir/[slug]/icone/[tamanho]/route');

const LOGO = 'https://ik.imagekit.io/svqexd6ol/motoboycity/store-logos/loja-1/logo_gb7Xi5Eem.jpg';

function pngFalso() {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    headers: { 'Content-Type': 'image/png' },
  });
}

describe('logo da loja como ícone', () => {
  let fetchFalso: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('pede ao ImageKit o logo quadrado, em PNG, no tamanho do ícone', () => {
    const url = new URL(urlDoLogoQuadrado(LOGO, 192)!);

    expect(url.origin + url.pathname).toBe(LOGO);
    expect(url.searchParams.get('tr')).toBe('w-192,h-192,c-maintain_ratio,f-png');
  });

  it('não busca endereço fora do ImageKit nem sem HTTPS', () => {
    expect(urlDoLogoQuadrado('https://exemplo.com/logo.png', 192)).toBeNull();
    expect(urlDoLogoQuadrado('http://ik.imagekit.io/x/logo.png', 192)).toBeNull();
    expect(urlDoLogoQuadrado('https://ik.imagekit.io.exemplo.com/logo.png', 192)).toBeNull();
    expect(urlDoLogoQuadrado('não é endereço', 192)).toBeNull();
  });

  it('devolve o PNG quando o ImageKit responde', async () => {
    fetchFalso.mockResolvedValue(pngFalso());

    const png = await logoQuadradoEmPng(LOGO, 192);

    expect(png?.byteLength).toBe(4);
    expect(fetchFalso).toHaveBeenCalledWith(
      expect.stringContaining('tr=w-192%2Ch-192'),
      expect.anything(),
    );
  });

  it('ImageKit fora do ar ou resposta que não é PNG viram "sem logo"', async () => {
    fetchFalso.mockRejectedValueOnce(new Error('timeout'));
    await expect(logoQuadradoEmPng(LOGO, 192)).resolves.toBeNull();

    fetchFalso.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(logoQuadradoEmPng(LOGO, 192)).resolves.toBeNull();

    fetchFalso.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(logoQuadradoEmPng(LOGO, 192)).resolves.toBeNull();
  });

  it('a versão do ícone muda com o logo, a cor e a inicial, e só com eles', () => {
    const loja = { logoUrl: LOGO, corDaMarca: '#ff6600', nome: 'Rei do Frango' };
    const v = versaoDoIcone(loja);

    expect(versaoDoIcone({ ...loja })).toBe(v);
    expect(versaoDoIcone({ ...loja, nome: 'Rainha do Frango' })).toBe(v);
    expect(versaoDoIcone({ ...loja, logoUrl: `${LOGO}2` })).not.toBe(v);
    expect(versaoDoIcone({ ...loja, logoUrl: null })).not.toBe(v);
    expect(versaoDoIcone({ ...loja, corDaMarca: '#000000' })).not.toBe(v);
    expect(versaoDoIcone({ ...loja, nome: 'Bar do Zé' })).not.toBe(v);
  });
});

describe('rota do ícone', () => {
  let fetchFalso: ReturnType<typeof vi.fn>;

  function pedir(tamanho: string) {
    return GET(new Request('http://loja/icone'), {
      params: Promise.resolve({ slug: 'rei-do-frango', tamanho }),
    });
  }

  beforeEach(() => {
    fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('com logo, entrega o logo do ImageKit', async () => {
    mocks.identidadeDoLink.mockResolvedValue({
      nome: 'Rei do Frango',
      corDaMarca: '#ff6600',
      logoUrl: LOGO,
    });
    fetchFalso.mockResolvedValue(pngFalso());

    const resposta = await pedir('192');

    expect(resposta.headers.get('Content-Type')).toBe('image/png');
    expect(resposta.headers.get('X-Teste')).toBeNull();
    expect(new Uint8Array(await resposta.arrayBuffer())[0]).toBe(0x89);
  });

  it('sem logo, ou com o ImageKit fora, volta para a inicial', async () => {
    mocks.identidadeDoLink.mockResolvedValue({
      nome: 'Rei do Frango',
      corDaMarca: '#ff6600',
      logoUrl: null,
    });
    expect((await pedir('192')).headers.get('X-Teste')).toBe('inicial');
    expect(fetchFalso).not.toHaveBeenCalled();

    mocks.identidadeDoLink.mockResolvedValue({
      nome: 'Rei do Frango',
      corDaMarca: '#ff6600',
      logoUrl: LOGO,
    });
    fetchFalso.mockRejectedValue(new Error('timeout'));
    expect((await pedir('192')).headers.get('X-Teste')).toBe('inicial');
  });

  it('tamanho fora da lista nem busca a loja', async () => {
    expect((await pedir('4096')).status).toBe(404);
    expect(mocks.identidadeDoLink).not.toHaveBeenCalled();
  });
});
