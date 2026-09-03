export function offerDeadline(expiresInSeconds: number, nowMs = Date.now()): number {
  return nowMs + Math.max(0, expiresInSeconds) * 1_000;
}

/**
 * Atualizacoes da mesma oferta podem chegar pelo socket e pelo endpoint de
 * pendencia. Elas podem encurtar o prazo, nunca reiniciar o cronometro.
 */
export function stableOfferDeadline(
  currentOfferId: string | null,
  currentDeadlineMs: number | null,
  nextOfferId: string,
  nextExpiresInSeconds: number,
  options: { expiresAtEpochMs?: number; nowMs?: number } = {},
): number {
  const receivedDeadline = Number.isFinite(options.expiresAtEpochMs)
    ? Number(options.expiresAtEpochMs)
    : offerDeadline(nextExpiresInSeconds, options.nowMs);
  return currentOfferId === nextOfferId && currentDeadlineMs !== null
    ? Math.min(currentDeadlineMs, receivedDeadline)
    : receivedDeadline;
}

export function remainingOfferSeconds(expiresAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
}
