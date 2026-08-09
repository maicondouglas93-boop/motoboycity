import { getAllowedOrigins } from './cors';

describe('getAllowedOrigins', () => {
  const originalEnv = process.env['CORS_ORIGINS'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['CORS_ORIGINS'];
    } else {
      process.env['CORS_ORIGINS'] = originalEnv;
    }
  });

  it('retorna o padrão de dev quando CORS_ORIGINS não está definida', () => {
    delete process.env['CORS_ORIGINS'];

    expect(getAllowedOrigins()).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ]);
  });

  it('separa e limpa espaços de uma lista com vírgula', () => {
    process.env['CORS_ORIGINS'] =
      'https://app.example.com, https://admin.example.com ,https://x.com';

    expect(getAllowedOrigins()).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
      'https://x.com',
    ]);
  });

  it('ignora entradas vazias (ex.: vírgula sobrando no fim)', () => {
    process.env['CORS_ORIGINS'] = 'https://app.example.com,';

    expect(getAllowedOrigins()).toEqual(['https://app.example.com']);
  });
});
