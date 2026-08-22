declare global {
  interface Window {
    motoboyCityGoogleMaps?: Promise<typeof google>;
    /** Hook oficial do Google: chamado quando a chave é recusada. */
    gm_authFailure?: () => void;
  }
}

/**
 * Chave presente, mas recusada pelo Google.
 *
 * Este é o modo de falha que mais engana, porque o script carrega normalmente
 * nos dois caminhos em que ele acontece:
 *
 * 1. chave inválida, API não habilitada ou faturamento desligado — o Google só
 *    registra um aviso no console e não preenche as bibliotecas;
 * 2. referrer não autorizado — aí sim ele chama `gm_authFailure`, mas só quando
 *    o mapa tenta desenhar, muito depois do carregamento.
 *
 * Os três primeiros são os erros de configuração mais comuns, e a mensagem
 * cobre todos porque a tela não tem como distinguir qual deles foi.
 */
const KEY_REJECTED_MESSAGE =
  'O Google recusou a chave do mapa. Verifique se as APIs Maps JavaScript e Places estão ' +
  'habilitadas, se o faturamento está ativo e se o endereço atual está na restrição de referrer.';

let authFailure: string | null = null;
const failureSubscribers = new Set<(message: string) => void>();

/**
 * Avisa quando a chave for recusada.
 *
 * Chama de imediato se a falha já tiver acontecido antes da inscrição — o
 * `gm_authFailure` pode disparar antes do componente montar.
 */
export function onGoogleMapsAuthFailure(handler: (message: string) => void): () => void {
  if (authFailure) handler(authFailure);
  failureSubscribers.add(handler);
  return () => {
    failureSubscribers.delete(handler);
  };
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível.'));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.motoboyCityGoogleMaps) return window.motoboyCityGoogleMaps;

  const apiKey = process.env['NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'];
  if (!apiKey) {
    return Promise.reject(
      /**
       * A variável tem `NEXT_PUBLIC_` no nome, então ela é embutida no pacote
       * JavaScript e fica visível para qualquer visitante. Por isso a chave do
       * navegador é OUTRA credencial, restrita por referrer — nunca a
       * `GOOGLE_MAPS_API_KEY` que a API usa no servidor.
       */
      new Error(
        'Mapa não configurado: falta NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY no .env.local deste painel.',
      ),
    );
  }

  window.gm_authFailure = () => {
    authFailure = KEY_REJECTED_MESSAGE;
    for (const subscriber of failureSubscribers) {
      subscriber(KEY_REJECTED_MESSAGE);
    }
  };

  window.motoboyCityGoogleMaps = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    /**
     * Carregar não é o mesmo que funcionar.
     *
     * Com chave inválida, API não habilitada ou faturamento desligado, o Google
     * devolve um script que executa normalmente — `onload` dispara — mas deixa
     * `google.maps.places` sem preencher, e só registra um aviso no console.
     * Sem esta verificação, o erro chegava na tela como
     * "Cannot read properties of undefined (reading 'Autocomplete')".
     *
     * `gm_authFailure` não cobre este caso: ele é para a recusa que acontece
     * depois, ao desenhar o mapa com referrer não autorizado.
     */
    script.onload = () => {
      if (!window.google?.maps?.places) {
        reject(new Error(KEY_REJECTED_MESSAGE));
        return;
      }
      resolve(window.google);
    };
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Maps.'));
    document.head.appendChild(script);
  });
  return window.motoboyCityGoogleMaps;
}

export {};
