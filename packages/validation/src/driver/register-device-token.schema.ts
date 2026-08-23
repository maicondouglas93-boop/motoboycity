import { z } from 'zod';

/**
 * Registro do aparelho para receber push.
 *
 * O token do FCM nao tem formato publicado nem tamanho fixo, entao a validacao
 * aqui e deliberadamente frouxa: so barra vazio e absurdo. Inventar um padrao
 * quebraria no dia em que o Google mudasse o formato, e o unico juiz de verdade
 * e o proprio FCM na hora do envio — que ja devolve token invalido e faz a
 * limpeza.
 */
export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(10, 'Token de push inválido.').max(4096, 'Token de push inválido.'),
  platform: z.enum(['ANDROID', 'IOS'], { message: 'Plataforma inválida.' }),
  appVersion: z.string().trim().max(40).optional(),
});

export type RegisterDeviceTokenPayload = z.infer<typeof registerDeviceTokenSchema>;
