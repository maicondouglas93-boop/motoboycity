/*
 * Service worker da loja do cliente (/pedir/<slug>).
 *
 * Faz duas coisas, e só duas:
 *
 * - guarda os arquivos do Next que têm hash no nome, que nunca mudam, para a
 *   loja abrir rápido na segunda visita;
 * - guarda a última cópia de cada página DESTA loja, para quem perde a conexão
 *   no meio do caminho ainda ver o cardápio — e, sem cópia, ver um aviso claro
 *   em vez da tela de erro do navegador.
 *
 * Todo o resto passa direto, como se ele não existisse: login do Clerk,
 * pagamento do Asaas, a API, outras lojas.
 *
 * ESCOPO. Este arquivo mora na raiz do site porque é servido pelo mesmo app que
 * atende o painel das empresas, em produção. Ele só pode controlar uma loja.
 * Registrado em qualquer escopo que não seja /pedir/<slug> — a raiz, por
 * exemplo, que é o painel — ele se desregistra na primeira ativação.
 *
 * O escopo não termina em barra porque o Next redireciona /pedir/acai/ para
 * /pedir/acai, e com a barra a própria página da loja ficaria fora. O preço é
 * que /pedir/acai casa também com /pedir/acai-do-centro, que é OUTRA loja: por
 * isso cada requisição confere o caminho exato antes de ser tocada.
 */

const VERSAO = 'loja-v1';

/** Teto de arquivos guardados: cada publicação traz arquivos novos com hash novo. */
const LIMITE_DO_CACHE = 80;

const escopo = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const ESCOPO_VALIDO = /^\/pedir\/[^/]+$/.test(escopo);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      if (!ESCOPO_VALIDO) {
        await self.registration.unregister();
        return;
      }
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith('loja-') && nome !== VERSAO)
          .map((nome) => caches.delete(nome)),
      );
      await self.clients.claim();
    })(),
  );
});

function eDestaLoja(caminho) {
  return caminho === escopo || caminho.startsWith(escopo + '/');
}

self.addEventListener('fetch', (evento) => {
  if (!ESCOPO_VALIDO) return;

  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(doCacheOuDaRede(pedido));
    return;
  }

  if (pedido.mode === 'navigate' && eDestaLoja(url.pathname)) {
    evento.respondWith(daRedeOuDoCache(pedido));
  }
  // Qualquer outra coisa: nenhum respondWith, e o navegador segue normalmente.
});

/** Arquivos com hash: se já estão guardados, vêm do cache sem perguntar à rede. */
async function doCacheOuDaRede(pedido) {
  const cache = await caches.open(VERSAO);
  const guardado = await cache.match(pedido);
  if (guardado) return guardado;

  const resposta = await fetch(pedido);
  if (resposta.ok) {
    await cache.put(pedido, resposta.clone());
    await aparar(cache);
  }
  return resposta;
}

/**
 * Páginas: a rede sempre primeiro, porque o cardápio muda. O cache só entra
 * quando a rede falha — e aí a última cópia é melhor do que nada.
 */
async function daRedeOuDoCache(pedido) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) {
      await cache.put(pedido, resposta.clone());
      await aparar(cache);
    }
    return resposta;
  } catch {
    const guardado = await cache.match(pedido);
    return guardado ?? paginaSemConexao();
  }
}

/** Remove os mais antigos quando passa do teto — `keys()` vem em ordem de entrada. */
async function aparar(cache) {
  const chaves = await cache.keys();
  const excesso = chaves.length - LIMITE_DO_CACHE;
  for (let i = 0; i < excesso; i += 1) {
    await cache.delete(chaves[i]);
  }
}

function paginaSemConexao() {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão</title>
<style>
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, sans-serif; background: #fff; color: #17181c; padding: 24px; }
  main { max-width: 320px; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 14px; color: #6b7280; margin: 0 0 20px; line-height: 1.45; }
  button { font: inherit; font-size: 14px; font-weight: 600; padding: 12px 20px;
           border-radius: 12px; border: 1px solid #e6e6e9; background: #f6f6f7; color: inherit; }
</style>
</head>
<body>
<main>
  <h1>Sem conexão</h1>
  <p>Os itens que você escolheu continuam na sacola. Assim que a internet voltar, é só tentar de novo.</p>
  <button type="button" onclick="location.reload()">Tentar de novo</button>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
