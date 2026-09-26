/*
 * Service worker dos avisos da loja no painel (/loja/): pedido novo, agendado,
 * cancelado — com o painel fechado, pelo Web Push.
 *
 * Só avisos. Não tem `fetch`: não guarda nada e não passa por nenhuma
 * requisição do painel, que continua funcionando como se ele não existisse. O
 * escopo é /loja/, o diretório deste arquivo: ele não controla o resto do
 * painel, e nem precisa — a inscrição de push vale para o aparelho, esteja o
 * painel em que tela estiver.
 *
 * O servidor manda { titulo, corpo, url, etiqueta }. Com o painel visível em
 * alguma aba, o aviso não aparece: o próprio painel toca e notifica, com a
 * mesma etiqueta.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

function lerAviso(evento) {
  try {
    const aviso = evento.data ? evento.data.json() : null;
    return aviso && typeof aviso.titulo === 'string' ? aviso : null;
  } catch {
    return null;
  }
}

/** O painel é o site todo, menos a página das lojas dos clientes. */
function eDoPainel(url) {
  return !new URL(url).pathname.startsWith('/pedir/');
}

self.addEventListener('push', (evento) => {
  const aviso = lerAviso(evento);
  if (!aviso) return;
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const vendo = janelas.some(
        (janela) => janela.visibilityState === 'visible' && eDoPainel(janela.url),
      );
      if (vendo) return;
      await self.registration.showNotification(aviso.titulo, {
        body: aviso.corpo,
        tag: aviso.etiqueta,
        data: { url: aviso.url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(
    (evento.notification.data && evento.notification.data.url) || '/loja/vendas',
    self.location.origin,
  ).href;
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const aberta =
        janelas.find((janela) => janela.url === destino) ||
        janelas.find((janela) => eDoPainel(janela.url));
      if (aberta) {
        await aberta.focus();
        if (aberta.url !== destino && 'navigate' in aberta) {
          await aberta.navigate(destino).catch(() => undefined);
        }
        return;
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
