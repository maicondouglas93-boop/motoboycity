export interface IdempotencyAttempt {
  fingerprint: string;
  key: string;
}

function createUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : 8 + (random % 4);
    return value.toString(16);
  });
}

/** Mantém a chave enquanto o mesmo valor é reenviado após uma resposta perdida. */
export function idempotencyAttemptFor(
  current: IdempotencyAttempt | null,
  payload: unknown,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(payload);
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: createUuid() };
}
