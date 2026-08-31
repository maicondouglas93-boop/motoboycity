import type { ConfigService } from '@nestjs/config';
import { AsaasClient } from './asaas.client';

function config(): ConfigService {
  const values: Record<string, string> = {
    ASAAS_API_KEY: 'test-api-key',
    ASAAS_WEBHOOK_TOKEN: 'w'.repeat(40),
    ASAAS_ENVIRONMENT: 'sandbox',
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('AsaasClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserva somente o status e o codigo seguro quando a credencial e rejeitada', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              code: 'invalid_environment',
              description: 'descricao que nao deve entrar no erro ou no log',
            },
          ],
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new AsaasClient(config());

    await expect(client.findPaymentByExternalReference('invoice-ref')).rejects.toMatchObject({
      operation: 'FIND_PAYMENT',
      code: 'REQUEST_REJECTED',
      httpStatus: 401,
      outcomeUnknown: false,
      providerCode: 'invalid_environment',
      message: 'REQUEST_REJECTED',
    });
  });

  it('nao trata falha de rede em consulta como criacao de cobranca incerta', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const client = new AsaasClient(config());

    await expect(client.findPaymentByExternalReference('invoice-ref')).rejects.toMatchObject({
      operation: 'FIND_PAYMENT',
      code: 'NETWORK_OR_TIMEOUT',
      outcomeUnknown: false,
    });
  });

  it('marca como incerto o timeout da chamada que cria a cobranca', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const client = new AsaasClient(config());

    await expect(
      client.createPixPayment({
        customer: 'cus-1',
        value: 11.5,
        dueDate: '2026-08-31',
        description: 'Fatura FAT-1 - MOTOboyCity',
        externalReference: 'invoice-ref',
      }),
    ).rejects.toMatchObject({
      operation: 'CREATE_PAYMENT',
      code: 'NETWORK_OR_TIMEOUT',
      outcomeUnknown: true,
    });
  });
});
