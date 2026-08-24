import { createHash } from 'node:crypto';

/**
 * Identificador opaco da credencial atual. O JWT nunca recebe o passwordHash;
 * recebe apenas este digest, que muda junto com o sal aleatorio do novo hash.
 */
export function credentialFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url');
}
