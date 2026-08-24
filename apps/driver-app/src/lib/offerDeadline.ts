export function offerDeadline(expiresInSeconds: number, nowMs = Date.now()): number {
  return nowMs + Math.max(0, expiresInSeconds) * 1_000;
}

export function remainingOfferSeconds(expiresAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
}
