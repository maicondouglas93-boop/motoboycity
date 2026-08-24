import { updateCompanyProfileSchema } from '@motoboycity/validation';

describe('updateCompanyProfileSchema', () => {
  const validPayload = {
    tradeName: 'Mercado Central',
    legalName: 'Mercado Central LTDA',
    whatsapp: '(33) 99999-0000',
    fullName: 'Maria da Silva',
  };

  it('normaliza o WhatsApp e remove espaços dos nomes', () => {
    expect(
      updateCompanyProfileSchema.parse({
        ...validPayload,
        tradeName: '  Mercado Central  ',
        fullName: '  Maria da Silva  ',
      }),
    ).toEqual({
      ...validPayload,
      tradeName: 'Mercado Central',
      whatsapp: '33999990000',
      fullName: 'Maria da Silva',
    });
  });

  it('rejeita WhatsApp sem DDD ou com quantidade inválida de dígitos', () => {
    expect(
      updateCompanyProfileSchema.safeParse({ ...validPayload, whatsapp: '9999-0000' }).success,
    ).toBe(false);
  });
});
