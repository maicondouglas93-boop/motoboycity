import type { CompanyCustomer } from '@motoboycity/types';
import { describe, expect, it } from 'vitest';
import {
  buildCustomerRegistrationCandidates,
  customerToDeliveryFields,
  formatCustomerCpf,
} from '@/lib/company-customer';

const customer: CompanyCustomer = {
  id: 'customer-1',
  name: 'Maria Oliveira',
  cpf: '52998224725',
  phone: '33999999991',
  addressLabel: 'Casa',
  address: {
    street: 'Rua Um',
    number: '10',
    complement: 'Apto 2',
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
    lat: -20.15,
    lng: -41.62,
    referenceNote: 'Portao azul',
  },
  addresses: [
    {
      id: 'address-1',
      label: 'Casa',
      isPrimary: true,
      street: 'Rua Um',
      number: '10',
      complement: 'Apto 2',
      city: 'Lajinha',
      state: 'MG',
      zip: '36930000',
      lat: -20.15,
      lng: -41.62,
      referenceNote: 'Portao azul',
    },
  ],
  createdAt: '2026-08-26T12:00:00.000Z',
  updatedAt: '2026-08-26T12:00:00.000Z',
};

describe('company customer delivery integration', () => {
  it('preenche destinatario, telefone e endereco ao selecionar cliente', () => {
    expect(customerToDeliveryFields(customer)).toEqual({
      customerId: 'customer-1',
      recipientName: 'Maria Oliveira',
      recipientPhone: '33999999991',
      addressSearch: 'Rua Um, 10 - Apto 2, Lajinha/MG',
      address: {
        label: 'Rua Um, 10 - Apto 2, Lajinha/MG',
        street: 'Rua Um',
        number: '10',
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
        lat: -20.15,
        lng: -41.62,
      },
      number: '10',
      complement: 'Apto 2',
      referenceNote: 'Portao azul',
    });
  });

  it('nao inventa coordenadas quando o cadastro nao as possui', () => {
    expect(
      customerToDeliveryFields({
        ...customer,
        address: { ...customer.address, lat: null, lng: null },
        addresses: customer.addresses.map((address) => ({ ...address, lat: null, lng: null })),
      }).address,
    ).toBeNull();
  });

  it('usa o endereco nomeado escolhido no pedido', () => {
    const trabalho = {
      ...customer.addresses[0]!,
      id: 'address-2',
      label: 'Trabalho',
      isPrimary: false,
      street: 'Avenida Dois',
      number: '25',
      complement: null,
    };

    expect(customerToDeliveryFields(customer, trabalho)).toEqual(
      expect.objectContaining({
        addressSearch: 'Avenida Dois, 25, Lajinha/MG',
        number: '25',
      }),
    );
  });

  it('exibe claramente quando o CPF nao foi informado', () => {
    expect(formatCustomerCpf(null)).toBe('Não informado');
  });

  it('detecta cliente manual depois da entrega, normaliza telefone e remove duplicados do lote', () => {
    const draft = {
      customerId: null,
      recipientName: '  Maria Oliveira  ',
      recipientPhone: '(33) 99999-9991',
      address: customerToDeliveryFields(customer).address,
      number: '10',
      complement: 'Apto 2',
      referenceNote: 'Portao azul',
    };
    const candidates = buildCustomerRegistrationCandidates([
      draft,
      { ...draft },
      { ...draft, customerId: 'customer-1', recipientPhone: '33999999992' },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      name: 'Maria Oliveira',
      phone: '33999999991',
      address: customer.address,
    });
  });

  it('nao oferece cadastro quando nome, telefone ou endereco estao ausentes', () => {
    expect(
      buildCustomerRegistrationCandidates([
        {
          customerId: null,
          recipientName: '',
          recipientPhone: '',
          address: null,
          number: '',
          complement: '',
          referenceNote: '',
        },
      ]),
    ).toEqual([]);
  });
});
