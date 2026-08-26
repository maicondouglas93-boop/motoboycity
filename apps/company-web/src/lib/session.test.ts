import { beforeEach, describe, expect, it } from 'vitest';

import { session } from '@/lib/session';

describe('session', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('armazena e recupera o token de acesso', () => {
    session.setToken('token-valido');

    expect(session.getToken()).toBe('token-valido');
  });

  it('remove o token de acesso', () => {
    session.setToken('token-antigo');

    session.clearToken();

    expect(session.getToken()).toBeNull();
  });
});
