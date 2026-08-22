import { upsertCompanyAddressSchema } from '@motoboycity/validation';

const baseAddress = {
  street: 'Rua Exemplo',
  number: '100',
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
};

/**
 * Portao P0.6: o endereco de coleta alimenta a checagem de proximidade do
 * `complete-return`. Meia coordenada nao e um ponto — gravaria um valor
 * inutilizavel que so falharia com o motoboy parado na porta da empresa.
 */
describe('upsertCompanyAddressSchema — coordenadas', () => {
  it('aceita o endereco sem coordenada nenhuma', () => {
    expect(upsertCompanyAddressSchema.safeParse(baseAddress).success).toBe(true);
  });

  it('aceita o par completo', () => {
    const result = upsertCompanyAddressSchema.safeParse({
      ...baseAddress,
      lat: -20.15,
      lng: -41.74,
    });
    expect(result.success).toBe(true);
  });

  it('recusa latitude sem longitude', () => {
    const result = upsertCompanyAddressSchema.safeParse({ ...baseAddress, lat: -20.15 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('juntas');
  });

  it('recusa longitude sem latitude', () => {
    const result = upsertCompanyAddressSchema.safeParse({ ...baseAddress, lng: -41.74 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('juntas');
  });

  it('continua recusando coordenada fora da faixa', () => {
    expect(
      upsertCompanyAddressSchema.safeParse({ ...baseAddress, lat: -100, lng: -41.74 }).success,
    ).toBe(false);
    expect(
      upsertCompanyAddressSchema.safeParse({ ...baseAddress, lat: -20.15, lng: 200 }).success,
    ).toBe(false);
  });
});
