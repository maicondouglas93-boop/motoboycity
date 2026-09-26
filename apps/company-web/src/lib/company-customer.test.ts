import type { CompanyCustomer } from '@motoboycity/types';
import { describe, expect, it } from 'vitest';
import {
  buildCompletedDeliveryCustomerPrefill,
  buildCustomerRegistrationCandidates,
  buildStoreOrderCustomerPrefill,
  type CompletedDeliveryCustomerSource,
  customerHasAddress,
  customerToDeliveryFields,
  formatCustomerCpf,
  type StoreOrderCustomerSource,
  unusedAddressLabel,
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

const completedDelivery = {
  batchId: null,
  destinationKnownAtCreation: false,
  status: 'COMPLETED',
  recipientName: '  Maria Oliveira  ',
  recipientPhone: '(33) 99999-9991',
  addresses: [
    {
      type: 'DROPOFF',
      street: 'Rua Um',
      number: null,
      complement: null,
      city: 'Lajinha',
      state: 'MG',
      zip: '36930-000',
      lat: -20.15,
      lng: -41.62,
      referenceNote: null,
    },
  ],
} satisfies CompletedDeliveryCustomerSource;

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

  it('preenche o cadastro com o destino final capturado em pedido avulso', () => {
    expect(buildCompletedDeliveryCustomerPrefill(completedDelivery)).toEqual({
      name: 'Maria Oliveira',
      phone: '33999999991',
      addressLabel: 'Destino da entrega',
      address: {
        street: 'Rua Um',
        number: '',
        complement: null,
        city: 'Lajinha',
        state: 'MG',
        zip: '36930-000',
        lat: -20.15,
        lng: -41.62,
        referenceNote: null,
      },
    });
  });

  it.each([
    ['pedido em lote', { batchId: 'batch-1' }],
    ['destino conhecido na criacao', { destinationKnownAtCreation: true }],
    ['pedido ainda coletado', { status: 'COLLECTED' as const }],
    ['entrega sem sucesso', { status: 'FAILED' as const }],
    ['telefone invalido', { recipientPhone: '123' }],
    [
      'endereco ainda sem geocodificacao reversa',
      { addresses: [{ ...completedDelivery.addresses[0]!, street: null }] },
    ],
  ])('nao oferece cadastro para %s', (_label, override) => {
    expect(buildCompletedDeliveryCustomerPrefill({ ...completedDelivery, ...override })).toBeNull();
  });
});

describe('cliente da venda da loja online', () => {
  const venda = {
    cliente: '  Ana Souza ',
    telefone: '5533988776655',
    entrega: {
      rua: 'Rua São José',
      numero: '45',
      complemento: 'fundos',
      bairro: 'Centro',
      cidade: 'Lajinha',
      estado: 'mg',
      cep: '36930-000',
      referencia: 'Portão azul',
    },
  } satisfies StoreOrderCustomerSource;
  const coleta = { zip: '36930111', state: 'MG' };

  it('monta o cadastro com o que o cliente digitou, e o bairro na referência', () => {
    expect(buildStoreOrderCustomerPrefill(venda, coleta)).toEqual({
      name: 'Ana Souza',
      phone: '33988776655',
      addressLabel: 'Centro',
      address: {
        street: 'Rua São José',
        number: '45',
        complement: 'fundos',
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
        lat: null,
        lng: null,
        referenceNote: 'Bairro Centro · Portão azul',
      },
    });
  });

  it('sem CEP ou UF no checkout, usa os da loja', () => {
    const prefill = buildStoreOrderCustomerPrefill(
      { ...venda, entrega: { ...venda.entrega, cep: '', estado: '', referencia: null } },
      coleta,
    );
    expect(prefill?.address).toMatchObject({
      zip: '36930111',
      state: 'MG',
      referenceNote: 'Bairro Centro',
    });
  });

  it.each([
    ['retirada, sem endereço', { entrega: null }],
    ['telefone inválido', { telefone: '123' }],
    ['nome curto demais', { cliente: 'A' }],
  ])('não oferece cadastro para %s', (_label, override) => {
    expect(buildStoreOrderCustomerPrefill({ ...venda, ...override }, coleta)).toBeNull();
  });

  it('reconhece o endereço já salvo sem olhar acento, caixa e complemento', () => {
    expect(customerHasAddress(customer, { street: 'RUA UM', number: '10', city: 'lajinha' })).toBe(
      true,
    );
    expect(customerHasAddress(customer, { street: 'Rua Um', number: '12', city: 'Lajinha' })).toBe(
      false,
    );
  });

  it('escolhe um nome de endereço que o cliente ainda não usa', () => {
    expect(unusedAddressLabel(customer, 'Centro')).toBe('Centro');
    expect(unusedAddressLabel(customer, 'casa')).toBe('casa 2');
  });
});
