const { resolveAppConfig, resolveAppVersion } = require('../app.env');
const packageJson = require('../package.json');

/**
 * Portao P0.2: a URL da API precisa ser configuravel por ambiente e um build
 * de pilot/production tem que FALHAR — nao avisar — quando recebe uma URL que
 * o aparelho nao alcanca na rua.
 */
describe('resolveAppConfig', () => {
  describe('development', () => {
    it('usa localhost como padrao quando nada e informado', () => {
      expect(resolveAppConfig({})).toMatchObject({
        appEnv: 'development',
        apiBaseUrl: 'http://localhost:3333',
      });
    });

    it('aceita override para o emulador Android', () => {
      expect(
        resolveAppConfig({
          MOTOBOYCITY_APP_ENV: 'development',
          MOTOBOYCITY_API_URL: 'http://10.0.2.2:3333',
        }).apiBaseUrl,
      ).toBe('http://10.0.2.2:3333');
    });
  });

  describe('pilot e production', () => {
    const strictEnvs = ['pilot', 'production'];

    it.each(strictEnvs)('%s exige URL explicita, sem padrao silencioso', (appEnv) => {
      expect(() => resolveAppConfig({ MOTOBOYCITY_APP_ENV: appEnv })).toThrow(
        /exige MOTOBOYCITY_API_URL explicita/,
      );
    });

    it.each(strictEnvs)('%s recusa HTTP', (appEnv) => {
      expect(() =>
        resolveAppConfig({
          MOTOBOYCITY_APP_ENV: appEnv,
          MOTOBOYCITY_API_URL: 'http://api.exemplo.com',
        }),
      ).toThrow(/exige HTTPS/);
    });

    it.each(strictEnvs)('%s recusa string vazia', (appEnv) => {
      expect(() =>
        resolveAppConfig({ MOTOBOYCITY_APP_ENV: appEnv, MOTOBOYCITY_API_URL: '   ' }),
      ).toThrow(/exige MOTOBOYCITY_API_URL explicita/);
    });

    it.each([
      'https://localhost:3333',
      'https://127.0.0.1:3333',
      'https://10.1.2.3',
      'https://192.168.0.10',
      'https://172.16.5.4',
      'https://172.31.255.1',
      'https://169.254.1.1',
      'https://macbook.local',
    ])('production recusa host inalcancavel na rua: %s', (url) => {
      expect(() =>
        resolveAppConfig({ MOTOBOYCITY_APP_ENV: 'production', MOTOBOYCITY_API_URL: url }),
      ).toThrow(/loopback, IP privado ou \.local/);
    });

    it('aceita um host publico com HTTPS', () => {
      expect(
        resolveAppConfig({
          MOTOBOYCITY_APP_ENV: 'pilot',
          MOTOBOYCITY_API_URL: 'https://api-pilot.exemplo.com',
        }),
      ).toMatchObject({ appEnv: 'pilot', apiBaseUrl: 'https://api-pilot.exemplo.com' });
    });

    it('nao confunde 172.32 com a faixa privada 172.16-31', () => {
      expect(
        resolveAppConfig({
          MOTOBOYCITY_APP_ENV: 'production',
          MOTOBOYCITY_API_URL: 'https://172.32.0.1',
        }).apiBaseUrl,
      ).toBe('https://172.32.0.1');
    });
  });

  describe('normalizacao e entradas invalidas', () => {
    it('remove a barra final para nao gerar "//rota" no api-client', () => {
      expect(
        resolveAppConfig({
          MOTOBOYCITY_APP_ENV: 'pilot',
          MOTOBOYCITY_API_URL: 'https://api.exemplo.com/',
        }).apiBaseUrl,
      ).toBe('https://api.exemplo.com');
    });

    it('recusa um ambiente desconhecido', () => {
      expect(() => resolveAppConfig({ MOTOBOYCITY_APP_ENV: 'staging' })).toThrow(/desconhecido/);
    });

    it('recusa uma URL relativa', () => {
      expect(() =>
        resolveAppConfig({ MOTOBOYCITY_APP_ENV: 'pilot', MOTOBOYCITY_API_URL: '/api' }),
      ).toThrow(/nao e uma URL absoluta/);
    });
  });
});

/**
 * Portao P0.3: a versao visivel precisa ter uma fonte unica. O `versionName`
 * do Android le o mesmo `package.json` (ver `android/app/build.gradle`), entao
 * uma divergencia como a antiga — `0.0.1` no JS contra `1.0` no Android — nao
 * pode voltar a existir sem quebrar este teste.
 */
describe('resolveAppVersion', () => {
  it('vem do package.json, nao de uma constante escrita a mao', () => {
    expect(resolveAppVersion()).toBe(packageJson.version);
  });

  it('e exposta na configuracao resolvida, para o Babel inlinar', () => {
    expect(resolveAppConfig({}).appVersion).toBe(packageJson.version);
  });

  it('usa um formato que o versionName do Android aceita', () => {
    expect(resolveAppVersion()).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});
