const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

/**
 * Lida diretamente com process.env (sem DI) porque também é usada pelo
 * @WebSocketGateway, cujo objeto `cors` é resolvido no momento da definição
 * da classe — antes do Nest montar o container de injeção de dependência.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (!raw) {
    return DEFAULT_DEV_ORIGINS;
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
