import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';

describe('AiqfomeCredentialsService', () => {
  const values: Record<string, string> = {
    AIQFOME_CLIENT_ID: 'client-id',
    AIQFOME_CLIENT_SECRET: 'client-secret',
    AIQFOME_REDIRECT_URI: 'https://api.example.com/integrations/aiqfome/callback',
    AIQFOME_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
  const service = new AiqfomeCredentialsService({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
  const credentials = {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    tokenType: 'Bearer',
    scope: ['aqf:store:read', 'aqf:order:read'],
    expiresAt: '2026-08-27T22:00:00.000Z',
  };

  it('cifra e recupera tokens usando o id da integracao como contexto', () => {
    const sealed = service.seal('integration-1', credentials);

    expect(sealed.encryptedPayload).not.toContain(credentials.accessToken);
    expect(sealed.encryptedPayload).not.toContain(credentials.refreshToken);
    expect(service.open('integration-1', sealed)).toEqual(credentials);
  });

  it('impede mover o payload cifrado para outra integracao', () => {
    const sealed = service.seal('integration-1', credentials);

    expect(() => service.open('integration-2', sealed)).toThrow();
  });
});
