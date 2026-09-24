import { beforeEach, describe, expect, it } from 'vitest';
import { pageProtectionSession } from '@/lib/page-protection-session';

describe('pageProtectionSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('armazena e recupera o token de desbloqueio quando valido', () => {
    pageProtectionSession.setUnlockToken('FINANCEIRO', 'unlock-jwt-123', 1800);

    expect(pageProtectionSession.isUnlocked('FINANCEIRO')).toBe(true);
    expect(pageProtectionSession.getUnlockToken('FINANCEIRO')).toBe('unlock-jwt-123');
  });

  it('retorna null quando nao ha token para a rota', () => {
    expect(pageProtectionSession.isUnlocked('RELATORIOS')).toBe(false);
    expect(pageProtectionSession.getUnlockToken('RELATORIOS')).toBeNull();
  });

  it('retorna null e limpa o armazenamento quando o token expira', () => {
    // expiresInSeconds = -10 (ja expirado)
    pageProtectionSession.setUnlockToken('FINANCEIRO', 'expired-token', -10);

    expect(pageProtectionSession.isUnlocked('FINANCEIRO')).toBe(false);
    expect(pageProtectionSession.getUnlockToken('FINANCEIRO')).toBeNull();
  });

  it('remove token especifico com clearUnlockToken', () => {
    pageProtectionSession.setUnlockToken('FINANCEIRO', 'token-1', 1800);
    pageProtectionSession.setUnlockToken('RELATORIOS', 'token-2', 1800);

    pageProtectionSession.clearUnlockToken('FINANCEIRO');

    expect(pageProtectionSession.isUnlocked('FINANCEIRO')).toBe(false);
    expect(pageProtectionSession.isUnlocked('RELATORIOS')).toBe(true);
  });

  it('resolve o token correto baseado na URL da API', () => {
    pageProtectionSession.setUnlockToken('FINANCEIRO', 'fin-token', 1800);
    pageProtectionSession.setUnlockToken('RELATORIOS', 'rep-token', 1800);

    expect(
      pageProtectionSession.getUnlockTokenForUrl('http://localhost:3333/company/financial/position'),
    ).toBe('fin-token');

    expect(
      pageProtectionSession.getUnlockTokenForUrl('http://localhost:3333/company/reports/operations'),
    ).toBe('rep-token');

    expect(
      pageProtectionSession.getUnlockTokenForUrl('http://localhost:3333/auth/me'),
    ).toBeNull();
  });
});
