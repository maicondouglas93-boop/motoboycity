import { z } from 'zod';

/**
 * A conta Asaas que a loja liga ao MOTOboyCity: a chave da API, gerada no
 * painel do Asaas (Integrações → Chaves de API), e em qual ambiente ela vale.
 * Quem confere se a chave abre uma conta de verdade é o servidor, perguntando
 * ao próprio Asaas.
 */
export const storeAsaasAccountSchema = z.object({
  chaveDaApi: z
    .string()
    .trim()
    .min(20, 'Cole a chave da API inteira.')
    .max(400, 'Essa chave está grande demais. Cole só a chave da API.')
    .refine((chave) => !/\s/.test(chave), 'A chave não tem espaço. Cole de novo.'),
  ambiente: z.enum(['SANDBOX', 'PRODUCAO']),
});

export type StoreAsaasAccountPayload = z.infer<typeof storeAsaasAccountSchema>;
