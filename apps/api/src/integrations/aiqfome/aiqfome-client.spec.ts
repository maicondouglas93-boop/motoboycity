import { ConfigService } from '@nestjs/config';
import { AiqfomeClient } from './aiqfome-client';

describe('AiqfomeClient token refresh', () => {
  const configValues: Record<string, string> = {
    AIQFOME_CLIENT_ID: 'client-id',
    AIQFOME_CLIENT_SECRET: 'client-secret',
    AIQFOME_REDIRECT_URI: 'https://api.example.com/integrations/aiqfome/callback',
    AIQFOME_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    COMPANY_WEB_URL: 'https://company.example.com',
  };

  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renova access e refresh token pelo grant oficial sem expor segredo na URL', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 7200,
          scope: 'aqf:store:read aqf:store:create aqf:order:read aqf:order:create',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new AiqfomeClient(config);

    await expect(client.refreshToken('old-refresh')).resolves.toEqual(
      expect.objectContaining({ access_token: 'new-access', refresh_token: 'new-refresh' }),
    );

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://id.magalu.com/oauth/token');
    expect(String(url)).not.toContain('old-refresh');
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('redirect_uri')).toBe(configValues['AIQFOME_REDIRECT_URI']);
  });

  it('preserva o status HTTP sanitizado quando o refresh e rejeitado', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new AiqfomeClient(config);

    await expect(client.refreshToken('invalid-refresh')).rejects.toMatchObject({
      code: 'TOKEN_REFRESH_FAILED',
      httpStatus: 401,
    });
  });

  it('sincroniza a etapa logistica pela rota V2 autenticada', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new AiqfomeClient(config);

    await client.markLogisticStatus('68670787', 'delivery-ongoing', 'access-token');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://plataforma.aiqfome.com/api/v2/logistic/68670787/delivery-ongoing',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
  });
});
