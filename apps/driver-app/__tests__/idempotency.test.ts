import { idempotencyAttemptFor } from '../src/lib/idempotency';

describe('idempotencyAttemptFor', () => {
  it('reutiliza a chave para o mesmo saque e troca quando o valor muda', () => {
    const first = idempotencyAttemptFor(null, { amount: 100 });
    const retry = idempotencyAttemptFor(first, { amount: 100 });
    const changed = idempotencyAttemptFor(first, { amount: 101 });

    expect(retry.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
    expect(first.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
