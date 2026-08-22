import type { RedisOptions } from 'ioredis';

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 6379;

export type RedisConnectionOptions = Pick<
  RedisOptions,
  'host' | 'port' | 'username' | 'password' | 'tls' | 'db' | 'family'
>;

/**
 * Fonte unica da conexao com o Redis (portao P0.4 do runbook de piloto).
 *
 * BullMQ (`QueueModule`) e a presenca ao vivo (`LiveDriverPresenceService`)
 * usam esta funcao para nao divergirem: antes cada um montava seu proprio
 * objeto com apenas `REDIS_HOST`/`REDIS_PORT`, o que impede usar qualquer
 * Redis gerenciado — eles exigem autenticacao e normalmente TLS.
 *
 * Ordem de precedencia:
 *   1. `REDIS_URL` (`redis://` ou `rediss://`) — forma preferencial, e o que
 *      provedores gerenciados entregam;
 *   2. `REDIS_HOST`/`REDIS_PORT` + credenciais avulsas — fallback explicito
 *      para desenvolvimento local.
 *
 * Segue `process.env` direto, sem DI, pelo mesmo motivo de `cors.ts`: precisa
 * ser chamavel de fabricas de modulo e do construtor de servicos, e o
 * `ConfigModule` e global sem `load` proprio, entao `ConfigService` apenas
 * reflete `process.env`.
 */
export function buildRedisConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): RedisConnectionOptions {
  const url = (env['REDIS_URL'] ?? '').trim();
  const options = url ? fromUrl(url) : fromHostPort(env);

  const family = parseFamily(env['REDIS_FAMILY']);
  if (family !== undefined) {
    options.family = family;
  }

  return options;
}

function fromUrl(url: string): RedisConnectionOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('REDIS_URL invalida: nao e uma URL absoluta.');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`REDIS_URL precisa usar redis:// ou rediss://; recebido "${parsed.protocol}".`);
  }

  // `URL.hostname` devolve IPv6 entre colchetes; o ioredis espera sem.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!host) {
    throw new Error('REDIS_URL invalida: host ausente.');
  }

  const options: RedisConnectionOptions = {
    host,
    port: parsed.port ? parsePort(parsed.port) : DEFAULT_PORT,
  };

  // `URL` devolve os dois percent-encoded — senha de provedor costuma ter
  // caractere especial, entao decodificar aqui evita autenticacao falhando
  // por um `%40` que deveria ser `@`.
  if (parsed.username) {
    options.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }

  if (parsed.protocol === 'rediss:') {
    options.tls = { servername: host };
  }

  const db = parseDb(parsed.pathname);
  if (db !== undefined) {
    options.db = db;
  }

  return options;
}

function fromHostPort(env: NodeJS.ProcessEnv): RedisConnectionOptions {
  const host = (env['REDIS_HOST'] ?? '').trim() || DEFAULT_HOST;
  const rawPort = (env['REDIS_PORT'] ?? '').trim();

  const options: RedisConnectionOptions = {
    host,
    port: rawPort ? parsePort(rawPort) : DEFAULT_PORT,
  };

  // `REDISUSER`/`REDISPASSWORD` sao os nomes que o Railway injeta; aceitar os
  // dois evita ter que renomear variavel no provedor.
  const username = (env['REDIS_USERNAME'] ?? env['REDISUSER'] ?? '').trim();
  const password = env['REDIS_PASSWORD'] ?? env['REDISPASSWORD'] ?? '';

  if (username) {
    options.username = username;
  }
  if (password) {
    options.password = password;
  }

  if ((env['REDIS_TLS'] ?? '').trim().toLowerCase() === 'true') {
    options.tls = { servername: host };
  }

  return options;
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Porta de Redis invalida: ${JSON.stringify(raw)}.`);
  }
  return port;
}

function parseDb(pathname: string): number | undefined {
  const raw = pathname.replace(/^\//, '').trim();
  if (!raw) {
    return undefined;
  }

  const db = Number(raw);
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`Indice de banco invalido em REDIS_URL: ${JSON.stringify(raw)}.`);
  }
  return db;
}

/**
 * `family: 0` deixa o resolvedor aceitar IPv4 e IPv6. Redes privadas de
 * provedores (Railway, por exemplo) costumam expor o Redis apenas em IPv6, e
 * sem isso a conexao falha com ENOTFOUND mesmo com a URL correta.
 */
function parseFamily(raw: string | undefined): number | undefined {
  const value = (raw ?? '').trim();
  if (!value) {
    return undefined;
  }

  const family = Number(value);
  if (family !== 0 && family !== 4 && family !== 6) {
    throw new Error(`REDIS_FAMILY precisa ser 0, 4 ou 6; recebido ${JSON.stringify(raw)}.`);
  }
  return family;
}

/**
 * Descricao segura para log: host, porta, TLS e se ha autenticacao — nunca
 * usuario, senha ou a URL inteira.
 */
export function describeRedisTarget(options: RedisConnectionOptions): string {
  const scheme = options.tls ? 'rediss' : 'redis';
  const db = options.db === undefined ? '' : `/${options.db}`;
  const auth = options.password ? 'com autenticacao' : 'sem autenticacao';
  return `${scheme}://${options.host}:${options.port}${db} (${auth})`;
}
