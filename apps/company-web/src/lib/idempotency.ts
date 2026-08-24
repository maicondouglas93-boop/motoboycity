export interface IdempotencyAttempt {
  fingerprint: string;
  key: string;
}

/**
 * Mantem a mesma chave enquanto a pessoa repete exatamente a mesma criacao.
 * Se qualquer campo mudar, nasce uma nova tentativa logica e uma nova chave.
 */
export function idempotencyAttemptFor(
  current: IdempotencyAttempt | null,
  payload: unknown,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(payload);
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: crypto.randomUUID() };
}
