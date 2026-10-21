import { MAX_DINHEIRO_A_DEVOLVER, markDeliveredSchema } from '@motoboycity/validation';

/**
 * O dinheiro que o motoboy declara para devolver à loja na entrega com retorno.
 * Opcional porque o aplicativo antigo não manda; quando vem, precisa ser um
 * valor em reais e centavos que alguém consiga conferir no caixa.
 */
describe('markDeliveredSchema — dinheiro a devolver', () => {
  it('aceita sem o campo, como manda o aplicativo antigo', () => {
    expect(markDeliveredSchema.safeParse({}).success).toBe(true);
  });

  it('aceita zero: ele não recebeu dinheiro', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: 0 }).success).toBe(true);
  });

  it('aceita reais e centavos', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: 85.5 }).success).toBe(true);
    expect(markDeliveredSchema.safeParse({ cashToReturn: 0.1 + 0.2 }).success).toBe(true);
  });

  it('recusa valor negativo', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: -1 }).success).toBe(false);
  });

  it('recusa fração de centavo', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: 12.345 }).success).toBe(false);
  });

  it('recusa acima do teto, que é erro de digitação', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: MAX_DINHEIRO_A_DEVOLVER }).success).toBe(
      true,
    );
    expect(
      markDeliveredSchema.safeParse({ cashToReturn: MAX_DINHEIRO_A_DEVOLVER + 0.01 }).success,
    ).toBe(false);
  });

  it('recusa texto: o app manda número, nunca "85,50"', () => {
    expect(markDeliveredSchema.safeParse({ cashToReturn: '85,50' }).success).toBe(false);
  });
});
