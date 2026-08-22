import { buildRedisConnectionOptions, describeRedisTarget } from './redis-connection';

/**
 * Portao P0.4: a API precisa aceitar um Redis gerenciado (URL, usuario, senha,
 * TLS) sem perder o fallback local. BullMQ e presenca ao vivo consomem esta
 * mesma funcao, entao o que estiver coberto aqui vale para os dois.
 */
describe('buildRedisConnectionOptions', () => {
  describe('fallback local', () => {
    it('usa localhost:6379 quando nada e informado', () => {
      expect(buildRedisConnectionOptions({})).toEqual({ host: 'localhost', port: 6379 });
    });

    it('respeita REDIS_HOST e REDIS_PORT', () => {
      expect(buildRedisConnectionOptions({ REDIS_HOST: 'cache', REDIS_PORT: '6380' })).toEqual({
        host: 'cache',
        port: 6380,
      });
    });

    it('nao inventa credenciais quando nao ha', () => {
      const options = buildRedisConnectionOptions({ REDIS_HOST: 'cache' });
      expect(options.username).toBeUndefined();
      expect(options.password).toBeUndefined();
      expect(options.tls).toBeUndefined();
    });

    it('aceita credenciais avulsas e TLS explicito', () => {
      expect(
        buildRedisConnectionOptions({
          REDIS_HOST: 'cache.provedor.com',
          REDIS_PORT: '6380',
          REDIS_USERNAME: 'default',
          REDIS_PASSWORD: 'senha',
          REDIS_TLS: 'true',
        }),
      ).toEqual({
        host: 'cache.provedor.com',
        port: 6380,
        username: 'default',
        password: 'senha',
        tls: { servername: 'cache.provedor.com' },
      });
    });

    it('aceita os nomes REDISUSER/REDISPASSWORD injetados pelo Railway', () => {
      const options = buildRedisConnectionOptions({
        REDIS_HOST: 'cache',
        REDISUSER: 'default',
        REDISPASSWORD: 'senha',
      });
      expect(options.username).toBe('default');
      expect(options.password).toBe('senha');
    });
  });

  describe('REDIS_URL tem precedencia', () => {
    it('ignora host/porta avulsos quando ha URL', () => {
      const options = buildRedisConnectionOptions({
        REDIS_URL: 'redis://cache.interno:6380',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
      });
      expect(options.host).toBe('cache.interno');
      expect(options.port).toBe(6380);
    });

    it('extrai usuario e senha da URL', () => {
      expect(
        buildRedisConnectionOptions({ REDIS_URL: 'redis://default:segredo@cache:6379' }),
      ).toEqual({ host: 'cache', port: 6379, username: 'default', password: 'segredo' });
    });

    it('decodifica caractere especial na senha', () => {
      // "p@ss:w rd" precisa chegar decodificado, senao a autenticacao falha.
      const options = buildRedisConnectionOptions({
        REDIS_URL: 'redis://default:p%40ss%3Aw%20rd@cache:6379',
      });
      expect(options.password).toBe('p@ss:w rd');
    });

    it('liga TLS em rediss:// sem precisar de flag separada', () => {
      const options = buildRedisConnectionOptions({
        REDIS_URL: 'rediss://cache.provedor.com:6380',
      });
      expect(options.tls).toEqual({ servername: 'cache.provedor.com' });
    });

    it('nao liga TLS em redis://', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://cache:6379' }).tls).toBeUndefined();
    });

    it('usa 6379 quando a URL omite a porta', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://cache' }).port).toBe(6379);
    });

    it('le o indice do banco no caminho', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://cache:6379/3' }).db).toBe(3);
    });

    it('nao define db quando a URL nao traz caminho', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://cache:6379' }).db).toBeUndefined();
    });

    it('remove os colchetes de um host IPv6', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://[::1]:6379' }).host).toBe('::1');
    });
  });

  describe('family para rede dual-stack', () => {
    it('nao define family por padrao', () => {
      expect(buildRedisConnectionOptions({ REDIS_URL: 'redis://cache' }).family).toBeUndefined();
    });

    it('aceita family 0, usada em rede privada so-IPv6', () => {
      expect(
        buildRedisConnectionOptions({ REDIS_URL: 'redis://cache', REDIS_FAMILY: '0' }).family,
      ).toBe(0);
    });

    it('recusa um family que nao existe', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_FAMILY: '5' })).toThrow(/REDIS_FAMILY/);
    });
  });

  describe('entradas invalidas falham cedo', () => {
    it('recusa protocolo que nao seja redis', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_URL: 'http://cache:6379' })).toThrow(
        /redis:\/\/ ou rediss:\/\//,
      );
    });

    it('recusa "host:porta" solto, que o URL interpreta como esquema', () => {
      // `new URL('cache:6379')` nao falha: le "cache:" como protocolo. Quem
      // barra e a checagem de protocolo, nao a de URL absoluta.
      expect(() => buildRedisConnectionOptions({ REDIS_URL: 'cache:6379' })).toThrow(
        /redis:\/\/ ou rediss:\/\//,
      );
    });

    it('recusa algo que o parser de URL nao consegue ler', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_URL: '//cache:6379' })).toThrow(
        /nao e uma URL absoluta/,
      );
    });

    it('recusa URL sem host', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_URL: 'redis://' })).toThrow(
        /host ausente|nao e uma URL absoluta/,
      );
    });

    it('recusa porta fora da faixa', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_PORT: '70000' })).toThrow(/Porta de Redis/);
    });

    it('recusa porta nao numerica', () => {
      expect(() => buildRedisConnectionOptions({ REDIS_PORT: 'abc' })).toThrow(/Porta de Redis/);
    });
  });
});

describe('describeRedisTarget', () => {
  it('nunca expoe usuario ou senha', () => {
    const options = buildRedisConnectionOptions({
      REDIS_URL: 'rediss://default:segredo@cache.provedor.com:6380/2',
    });
    const texto = describeRedisTarget(options);

    expect(texto).toBe('rediss://cache.provedor.com:6380/2 (com autenticacao)');
    expect(texto).not.toContain('segredo');
    expect(texto).not.toContain('default');
  });

  it('sinaliza quando nao ha autenticacao', () => {
    expect(describeRedisTarget(buildRedisConnectionOptions({}))).toBe(
      'redis://localhost:6379 (sem autenticacao)',
    );
  });
});
