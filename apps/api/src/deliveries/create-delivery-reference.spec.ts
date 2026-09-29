import { createDeliveryBatchSchema, createDeliverySchema } from '@motoboycity/validation';

/**
 * O endereço de referência: o que o cliente digitou e o Google não achou. Só
 * existe na entrega avulsa (destino por GPS), onde é lido pelo motoboy e não
 * entra em preço — e nunca junto de um destino conhecido, onde já há o endereço.
 */

const endereco = {
  street: 'Rua das Flores',
  number: '45',
  city: 'Lajinha',
  state: 'MG',
  zip: '36980-000',
};
const base = { serviceTypeId: '6f1c1d52-8a0e-4b8e-9d1a-3c2b1a0f9e8d' };

describe('createDeliverySchema — endereço de referência', () => {
  it('a avulsa aceita o endereço de referência, e ele não vira endereço de entrega', () => {
    const resultado = createDeliverySchema.safeParse({
      ...base,
      destinationKnownAtCreation: false,
      referenceAddress: endereco,
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.referenceAddress).toMatchObject({ street: 'Rua das Flores' });
      expect(resultado.data.dropoffAddress).toBeUndefined();
    }
  });

  it('a avulsa segue recusando o endereço de entrega, como sempre', () => {
    const resultado = createDeliverySchema.safeParse({
      ...base,
      destinationKnownAtCreation: false,
      dropoffAddress: endereco,
    });

    expect(resultado.success).toBe(false);
  });

  it('com destino conhecido, o endereço de referência não faz sentido', () => {
    const resultado = createDeliverySchema.safeParse({
      ...base,
      destinationKnownAtCreation: true,
      dropoffAddress: endereco,
      referenceAddress: endereco,
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]).toMatchObject({ path: ['referenceAddress'] });
    }
  });

  it('o CEP do endereço de referência segue a mesma regra do de entrega', () => {
    const resultado = createDeliverySchema.safeParse({
      ...base,
      destinationKnownAtCreation: false,
      referenceAddress: { ...endereco, zip: '3698' },
    });

    expect(resultado.success).toBe(false);
  });

  it('lote não aceita o endereço de referência', () => {
    const item = { ...base, destinationKnownAtCreation: false };
    const resultado = createDeliveryBatchSchema.safeParse({
      deliveries: [{ ...item, referenceAddress: endereco }, item],
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]).toMatchObject({ path: ['deliveries', 0, 'referenceAddress'] });
    }
  });
});
