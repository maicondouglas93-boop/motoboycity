import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 1;

/** O que fica cifrado de cada conta: a chave da API e o token do webhook dela. */
const segredosSchema = z.object({
  apiKey: z.string().min(1),
  webhookToken: z.string().min(32),
});

export type SegredosDaConta = z.infer<typeof segredosSchema>;

export interface SegredosCifrados {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/**
 * Cifra as credenciais das contas Asaas das lojas: AES-256-GCM, com o id da
 * empresa como dado autenticado — a linha de uma loja não abre como se fosse
 * de outra. Uma chave só (`STORE_ASAAS_ENCRYPTION_KEY`, 32 bytes em Base64)
 * abre todas: perdê-la obriga cada loja a ligar a conta de novo, e não há
 * rotação escrita. Guarde uma cópia fora do Render.
 *
 * A API sobe sem ela; a falta aparece quando a primeira loja tenta ligar a
 * conta, e a gravação é recusada — nunca em texto puro.
 */
@Injectable()
export class StoreAsaasCredentialsService {
  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return this.chave() !== null;
  }

  cifrar(companyId: string, segredos: SegredosDaConta): SegredosCifrados {
    const chave = this.chaveObrigatoria();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, chave, iv);
    cipher.setAAD(Buffer.from(companyId, 'utf8'));
    const cifrado = Buffer.concat([
      cipher.update(JSON.stringify(segredosSchema.parse(segredos)), 'utf8'),
      cipher.final(),
    ]);
    return {
      encryptedPayload: cifrado.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: KEY_VERSION,
    };
  }

  abrir(companyId: string, cifrados: SegredosCifrados): SegredosDaConta {
    if (cifrados.keyVersion !== KEY_VERSION) {
      throw new Error('Versão de chave da conta Asaas não suportada.');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.chaveObrigatoria(),
      Buffer.from(cifrados.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(companyId, 'utf8'));
    decipher.setAuthTag(Buffer.from(cifrados.authTag, 'base64'));
    const aberto = Buffer.concat([
      decipher.update(Buffer.from(cifrados.encryptedPayload, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return segredosSchema.parse(JSON.parse(aberto) as unknown);
  }

  private chave(): Buffer | null {
    const bruta = this.config.get<string>('STORE_ASAAS_ENCRYPTION_KEY')?.trim();
    if (!bruta) return null;
    const chave = Buffer.from(bruta, 'base64');
    return chave.length === 32 ? chave : null;
  }

  private chaveObrigatoria(): Buffer {
    const chave = this.chave();
    if (!chave) {
      throw new Error('STORE_ASAAS_ENCRYPTION_KEY ausente ou sem 32 bytes em Base64.');
    }
    return chave;
  }
}
