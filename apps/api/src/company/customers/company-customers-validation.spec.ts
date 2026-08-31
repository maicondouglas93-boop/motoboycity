import {
  companyCustomerInputSchema,
  companyCustomerRankingQuerySchema,
  companyCustomerSavedAddressSchema,
  listCompanyCustomersQuerySchema,
  matchCompanyCustomerQuerySchema,
} from '@motoboycity/validation';

const validCustomer = {
  name: 'Joao da Silva',
  cpf: '529.982.247-25',
  phone: '(33) 99999-9991',
  address: {
    street: 'Rua das Flores',
    number: '100',
    city: 'Lajinha',
    state: 'MG',
    zip: '36930-000',
    lat: -20.151,
    lng: -41.622,
  },
};

describe('company customer validation', () => {
  it('normaliza CPF e telefone validos', () => {
    const result = companyCustomerInputSchema.parse(validCustomer);
    expect(result.cpf).toBe('52998224725');
    expect(result.phone).toBe('33999999991');
    expect(result.addressLabel).toBe('Principal');
  });

  it('valida o nome dos enderecos salvos', () => {
    expect(
      companyCustomerSavedAddressSchema.parse({
        label: ' Trabalho ',
        address: validCustomer.address,
      }).label,
    ).toBe('Trabalho');
    expect(
      companyCustomerSavedAddressSchema.safeParse({
        label: ' ',
        address: validCustomer.address,
      }).success,
    ).toBe(false);
  });

  it('aceita CPF ausente ou vazio', () => {
    expect(
      companyCustomerInputSchema.parse({ ...validCustomer, cpf: undefined }).cpf,
    ).toBeUndefined();
    expect(companyCustomerInputSchema.parse({ ...validCustomer, cpf: '' }).cpf).toBeUndefined();
  });

  it('normaliza telefone brasileiro em E.164 para o mesmo cadastro nacional', () => {
    const result = companyCustomerInputSchema.parse({
      ...validCustomer,
      phone: '+55 (33) 99999-9991',
    });
    expect(result.phone).toBe('33999999991');
  });

  it.each(['52998224724', '11111111111', '123'])('rejeita CPF invalido %s', (cpf) => {
    expect(companyCustomerInputSchema.safeParse({ ...validCustomer, cpf }).success).toBe(false);
  });

  it('rejeita telefone sem DDD brasileiro valido', () => {
    expect(
      companyCustomerInputSchema.safeParse({ ...validCustomer, phone: '00999999999' }).success,
    ).toBe(false);
  });

  it('exige latitude e longitude em conjunto', () => {
    expect(
      companyCustomerInputSchema.safeParse({
        ...validCustomer,
        address: { ...validCustomer.address, lng: undefined },
      }).success,
    ).toBe(false);
  });

  it('aplica paginacao segura e exige identificador no match', () => {
    expect(listCompanyCustomersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(matchCompanyCustomerQuerySchema.safeParse({}).success).toBe(false);
  });

  it('limita o tamanho do ranking de clientes', () => {
    expect(companyCustomerRankingQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(companyCustomerRankingQuerySchema.parse({ limit: '20' })).toEqual({ limit: 20 });
    expect(companyCustomerRankingQuerySchema.safeParse({ limit: 2 }).success).toBe(false);
    expect(companyCustomerRankingQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
