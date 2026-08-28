import type { ConfigService } from '@nestjs/config';
import { readAiqfomeRuntimeConfig } from './aiqfome.config';

describe('readAiqfomeRuntimeConfig', () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  function configWith(tokenEncryptionKey: string): ConfigService {
    const values: Record<string, string> = {
      AIQFOME_CLIENT_ID: 'client-id',
      AIQFOME_CLIENT_SECRET: 'client-secret',
      AIQFOME_REDIRECT_URI: 'https://api.example.com/integrations/aiqfome/callback',
      AIQFOME_TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
      COMPANY_WEB_URL: 'https://company.example.com',
    };
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  }

  it('aceita uma chave Base64 canonica com exatamente 32 bytes', () => {
    expect(readAiqfomeRuntimeConfig(configWith(validKey))).toMatchObject({
      tokenEncryptionKey: validKey,
    });
  });

  it.each(['valor-invalido', Buffer.alloc(31, 7).toString('base64'), `${validKey}=`])(
    'rejeita a chave de cifra invalida antes de iniciar o OAuth',
    (invalidKey) => {
      expect(readAiqfomeRuntimeConfig(configWith(invalidKey))).toBeNull();
    },
  );
});
