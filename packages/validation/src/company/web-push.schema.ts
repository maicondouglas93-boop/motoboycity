import { z } from 'zod';

/**
 * Os serviços de push dos navegadores. O servidor faz um POST no endereço que
 * o navegador entregou: aceitar qualquer endereço deixaria quem se inscreve
 * apontar o servidor para dentro da própria rede (SSRF). Só estes domínios, e
 * só por HTTPS.
 */
const SERVICOS_DE_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge e os demais do Chromium; Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari (macOS e iPhone com o app instalado)
  /\.notify\.windows\.com$/, // Edge antigo no Windows
];

export function enderecoDePushAceito(endereco: string): boolean {
  try {
    const url = new URL(endereco);
    return (
      url.protocol === 'https:' && SERVICOS_DE_PUSH.some((padrao) => padrao.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** A inscrição que o navegador devolve em `pushManager.subscribe`, em JSON. */
export const webPushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .max(1000)
    .refine(enderecoDePushAceito, 'Serviço de avisos do navegador não reconhecido.'),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(200),
    auth: z.string().trim().min(1).max(100),
  }),
});

/** Para desligar: só o endereço, que é o que identifica o aparelho. */
export const webPushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1).max(1000),
});

export type WebPushSubscriptionPayload = z.infer<typeof webPushSubscriptionSchema>;
export type WebPushUnsubscribePayload = z.infer<typeof webPushUnsubscribeSchema>;
