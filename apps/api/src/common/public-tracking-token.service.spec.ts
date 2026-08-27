import { ConfigService } from '@nestjs/config';
import { PublicTrackingTokenService } from './public-tracking-token.service';

describe('PublicTrackingTokenService', () => {
  const service = new PublicTrackingTokenService({
    getOrThrow: jest.fn().mockReturnValue('segredo-exclusivo-de-teste'),
  } as unknown as ConfigService);

  it('reconstroi um token estavel e valida sua assinatura', () => {
    const identifier = 'a'.repeat(43);
    const token = service.tokenFromIdentifier(identifier);

    expect(service.tokenFromIdentifier(identifier)).toBe(token);
    expect(service.identifierFromToken(token)).toBe(identifier);
  });

  it('rejeita token adulterado ou fora do formato', () => {
    const identifier = 'b'.repeat(43);
    const token = service.tokenFromIdentifier(identifier);
    const tampered = `${identifier}.${token.endsWith('a') ? token.slice(44, -1) + 'b' : token.slice(44, -1) + 'a'}`;

    expect(service.identifierFromToken(tampered)).toBeNull();
    expect(service.identifierFromToken('token-curto')).toBeNull();
  });

  it('gera identificadores de 256 bits no formato URL-safe', () => {
    expect(service.createIdentifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
