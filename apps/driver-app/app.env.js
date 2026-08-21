/**
 * Resolucao do ambiente do driver-app em tempo de build (portao P0.2 do
 * runbook de piloto).
 *
 * CommonJS de proposito: este arquivo e carregado por `babel.config.js` e por
 * `metro.config.js`, que rodam no Node antes de qualquer transpilacao.
 *
 * A URL nao e segredo, mas precisa ser congelada no artefato: o valor
 * resolvido aqui e inlinado como literal pelo plugin Babel local, entao o APK
 * funciona sem Metro, sem USB e sem computador.
 *
 * Variaveis aceitas:
 *   MOTOBOYCITY_APP_ENV  development (padrao) | pilot | production
 *   MOTOBOYCITY_API_URL  obrigatoria em pilot/production; opcional em
 *                        development (util para 10.0.2.2 no emulador ou um IP
 *                        de LAN no aparelho fisico)
 */

const DEFAULT_URL_BY_ENV = {
  development: 'http://localhost:3333',
  // Sem padrao: o dominio do piloto e da producao ainda nao foi decidido, e
  // chutar um valor aqui e o tipo de coisa que vaza para um APK real.
  pilot: null,
  production: null,
};

const APP_ENVS = Object.keys(DEFAULT_URL_BY_ENV);

/** Ambientes que rodam em aparelho na rua, sem a maquina de desenvolvimento. */
const STRICT_ENVS = ['pilot', 'production'];

const PRIVATE_IPV4 = [
  /^127\./, // loopback
  /^10\./, // classe A privada
  /^192\.168\./, // classe C privada
  /^172\.(1[6-9]|2\d|3[01])\./, // classe B privada
  /^169\.254\./, // link-local
  /^0\./, // rota padrao / nao especificado
];

function isUnreachableFromPhone(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  // mDNS: so resolve na mesma rede local.
  if (host.endsWith('.local')) {
    return true;
  }
  if (host === '::1' || host === '::') {
    return true;
  }
  return PRIVATE_IPV4.some((range) => range.test(host));
}

function parseUrl(rawUrl, appEnv) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `MOTOBOYCITY_API_URL invalida para MOTOBOYCITY_APP_ENV="${appEnv}": ${JSON.stringify(rawUrl)} nao e uma URL absoluta.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `MOTOBOYCITY_API_URL precisa usar http ou https; recebido "${parsed.protocol}" em MOTOBOYCITY_APP_ENV="${appEnv}".`,
    );
  }

  return parsed;
}

function assertStrictUrl(parsed, appEnv) {
  // Android bloqueia cleartext por padrao, e um piloto de rua nao tem como
  // depender de excecao de rede local.
  if (parsed.protocol !== 'https:') {
    throw new Error(`MOTOBOYCITY_APP_ENV="${appEnv}" exige HTTPS. Recebido: ${parsed.origin}`);
  }

  if (isUnreachableFromPhone(parsed.hostname)) {
    throw new Error(
      `MOTOBOYCITY_APP_ENV="${appEnv}" nao aceita host de loopback, IP privado ou .local — o aparelho na rua tentaria acessar a si mesmo. Recebido: ${parsed.hostname}`,
    );
  }
}

/**
 * Normaliza para uso como `baseUrl` do api-client, que concatena
 * `${baseUrl}/rota`. Barra final produziria `//rota`.
 */
function normalize(parsed) {
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
}

function resolveAppConfig(env = process.env) {
  const appEnv = (env.MOTOBOYCITY_APP_ENV || 'development').trim();

  if (!APP_ENVS.includes(appEnv)) {
    throw new Error(
      `MOTOBOYCITY_APP_ENV="${appEnv}" desconhecido. Use um de: ${APP_ENVS.join(', ')}.`,
    );
  }

  const rawUrl = (env.MOTOBOYCITY_API_URL || '').trim() || DEFAULT_URL_BY_ENV[appEnv];

  if (!rawUrl) {
    throw new Error(
      `MOTOBOYCITY_APP_ENV="${appEnv}" exige MOTOBOYCITY_API_URL explicita. Nao existe URL padrao para este ambiente.`,
    );
  }

  const parsed = parseUrl(rawUrl, appEnv);

  if (STRICT_ENVS.includes(appEnv)) {
    assertStrictUrl(parsed, appEnv);
  }

  return { appEnv, apiBaseUrl: normalize(parsed) };
}

module.exports = { APP_ENVS, STRICT_ENVS, resolveAppConfig };
