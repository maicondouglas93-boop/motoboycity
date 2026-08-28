import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireAiqfomeRuntimeConfig } from './aiqfome.config';
import { aiqfomeStoredCredentialsSchema, type AiqfomeStoredCredentials } from './aiqfome.schemas';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 1;

export interface SealedAiqfomeCredentials {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  expiresAt: Date;
}

@Injectable()
export class AiqfomeCredentialsService {
  constructor(private readonly config: ConfigService) {}

  seal(integrationId: string, credentials: AiqfomeStoredCredentials): SealedAiqfomeCredentials {
    const parsed = aiqfomeStoredCredentialsSchema.parse(credentials);
    const key = this.readKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(integrationId, 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(parsed), 'utf8'),
      cipher.final(),
    ]);

    return {
      encryptedPayload: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: KEY_VERSION,
      expiresAt: new Date(parsed.expiresAt),
    };
  }

  open(
    integrationId: string,
    sealed: Pick<SealedAiqfomeCredentials, 'encryptedPayload' | 'iv' | 'authTag' | 'keyVersion'>,
  ): AiqfomeStoredCredentials {
    if (sealed.keyVersion !== KEY_VERSION) {
      throw new Error('Versão de chave de integração não suportada.');
    }

    const decipher = createDecipheriv(ALGORITHM, this.readKey(), Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(integrationId, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(sealed.encryptedPayload, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return aiqfomeStoredCredentialsSchema.parse(JSON.parse(decrypted) as unknown);
  }

  private readKey(): Buffer {
    const runtime = requireAiqfomeRuntimeConfig(this.config);
    const key = Buffer.from(runtime.tokenEncryptionKey, 'base64');
    if (key.length !== 32) {
      throw new Error('AIQFOME_TOKEN_ENCRYPTION_KEY precisa conter 32 bytes em Base64.');
    }
    return key;
  }
}
