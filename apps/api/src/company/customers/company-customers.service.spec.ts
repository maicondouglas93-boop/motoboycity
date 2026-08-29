import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleMapsService } from '../../maps/google-maps.service';
import { CompanyCustomersService } from './company-customers.service';

const companyUser = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;
const payload = {
  name: 'Joao da Silva',
  cpf: '52998224725',
  phone: '33999999991',
  addressLabel: 'Casa',
  address: {
    street: 'Rua das Flores',
    number: '100',
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
    lat: -20.15,
    lng: -41.62,
  },
};
const savedAddressRow = {
  id: 'address-a',
  customerId: 'customer-a',
  label: 'Casa',
  normalizedLabel: 'casa',
  isPrimary: true,
  street: payload.address.street,
  number: payload.address.number,
  complement: null,
  city: payload.address.city,
  state: payload.address.state,
  zip: payload.address.zip,
  lat: { toString: () => '-20.15' },
  lng: { toString: () => '-41.62' },
  referenceNote: null,
  createdAt: new Date('2026-08-26T12:00:00.000Z'),
  updatedAt: new Date('2026-08-26T12:00:00.000Z'),
};
const customerRow = {
  id: 'customer-a',
  companyId: 'company-a',
  name: payload.name,
  normalizedName: 'joao da silva',
  cpf: payload.cpf,
  phone: payload.phone,
  street: payload.address.street,
  number: payload.address.number,
  complement: null,
  city: payload.address.city,
  state: payload.address.state,
  zip: payload.address.zip,
  lat: { toString: () => '-20.15' },
  lng: { toString: () => '-41.62' },
  referenceNote: null,
  savedAddresses: [savedAddressRow],
  createdAt: new Date('2026-08-26T12:00:00.000Z'),
  updatedAt: new Date('2026-08-26T12:00:00.000Z'),
};

describe('CompanyCustomersService', () => {
  let service: CompanyCustomersService;
  let googleMaps: { geocode: jest.Mock };
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    companyCustomer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    companyCustomerSavedAddress: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-a' }) },
      companyCustomer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      companyCustomerSavedAddress: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    googleMaps = { geocode: jest.fn().mockResolvedValue(null) };
    const module = await Test.createTestingModule({
      providers: [
        CompanyCustomersService,
        { provide: PrismaService, useValue: prisma },
        // O painel resolve o endereco pelo Google Places e ja manda a
        // coordenada, entao o caminho normal nem chama isto. O duplo existe
        // para os testes que gravam endereco SEM ponto.
        { provide: GoogleMapsService, useValue: googleMaps },
      ],
    }).compile();
    service = module.get(CompanyCustomersService);
  });

  it('cria cliente, endereco principal e vincula entregas anteriores da empresa', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue(customerRow);

    const result = await service.create(companyUser, payload);

    expect(prisma.companyCustomer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-a',
        normalizedName: 'joao da silva',
        cpf: payload.cpf,
        phone: payload.phone,
        savedAddresses: {
          create: expect.objectContaining({
            label: 'Casa',
            normalizedLabel: 'casa',
            isPrimary: true,
          }),
        },
      }),
      include: { savedAddresses: { orderBy: [{ isPrimary: 'desc' }, { label: 'asc' }] } },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result.addressLabel).toBe('Casa');
    expect(result.addresses).toHaveLength(1);
    expect(result.address.lat).toBe(-20.15);
  });

  /**
   * O endereco salvo sem coordenada era uma armadilha silenciosa: ao escolher
   * aquele cliente, o painel devolvia `address: null` e o pedido era barrado
   * com "selecione no Google um endereco completo", sem dizer que o problema
   * estava no cadastro. O painel resolve pelo Places e ja manda o ponto — este
   * caminho existe para tudo que NAO passa por ele.
   */
  it('geocodifica o endereco quando a coordenada nao vem no payload', async () => {
    const semCoordenada = {
      ...payload,
      address: { ...payload.address, lat: undefined, lng: undefined },
    };
    googleMaps.geocode.mockResolvedValue({ lat: -20.1501, lng: -41.7401 });
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue(customerRow);

    await service.create(companyUser, semCoordenada);

    expect(googleMaps.geocode).toHaveBeenCalledWith(
      'Rua das Flores, 100 - Lajinha - MG - 36930000',
    );
    const gravado = prisma.companyCustomer.create.mock.calls[0][0].data;
    expect(gravado).toMatchObject({ lat: -20.1501, lng: -41.7401 });
    expect(gravado.savedAddresses.create).toMatchObject({ lat: -20.1501, lng: -41.7401 });
  });

  it('nao chama o Google quando a coordenada ja veio pronta', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue(customerRow);

    await service.create(companyUser, payload);

    expect(googleMaps.geocode).not.toHaveBeenCalled();
  });

  /**
   * A agenda de clientes nao pode depender do Google estar de pe. Sem
   * coordenada o cliente e salvo do mesmo jeito; quem decide se ela faz falta e
   * a regra de proximidade, la na entrega.
   */
  it('salva o cliente mesmo quando a geocodificacao falha', async () => {
    const semCoordenada = {
      ...payload,
      address: { ...payload.address, lat: undefined, lng: undefined },
    };
    googleMaps.geocode.mockRejectedValue(new Error('Google fora do ar'));
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue(customerRow);

    await expect(service.create(companyUser, semCoordenada)).resolves.toBeDefined();
    expect(prisma.companyCustomer.create.mock.calls[0][0].data).toMatchObject({
      lat: null,
      lng: null,
    });
  });

  it('cria cliente sem CPF e verifica duplicidade apenas pelo telefone', async () => {
    const payloadWithoutCpf = { ...payload, cpf: undefined };
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue({ ...customerRow, cpf: null });

    const result = await service.create(companyUser, payloadWithoutCpf);

    expect(prisma.companyCustomer.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-a', OR: [{ phone: payload.phone }] },
      select: { cpf: true, phone: true },
    });
    expect(result.cpf).toBeNull();
  });

  it('impede duplicacao por CPF antes da escrita', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue({ cpf: payload.cpf, phone: 'outro' });

    await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.companyCustomer.create).not.toHaveBeenCalled();
  });

  it('pesquisa nome normalizado e telefone sempre dentro da empresa', async () => {
    prisma.companyCustomer.findMany.mockResolvedValue([customerRow]);
    prisma.companyCustomer.count.mockResolvedValue(1);

    const result = await service.list(companyUser, { q: 'Joao 9999', page: 1, pageSize: 20 });

    expect(prisma.companyCustomer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          OR: [{ normalizedName: { contains: 'joao 9999' } }, { phone: { contains: '9999' } }],
        },
        include: { savedAddresses: { orderBy: [{ isPrimary: 'desc' }, { label: 'asc' }] } },
      }),
    );
    expect(result.total).toBe(1);
  });

  it('retorna estatisticas e enderecos mais usados no detalhe', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(customerRow);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          totalDeliveries: 37n,
          lastDeliveryAt: new Date('2026-08-26T12:00:00.000Z'),
          inProgressDeliveries: 2n,
          completedDeliveries: 34n,
          cancelledDeliveries: 1n,
        },
      ])
      .mockResolvedValueOnce([
        {
          street: payload.address.street,
          number: payload.address.number,
          complement: null,
          city: payload.address.city,
          state: payload.address.state,
          zip: payload.address.zip,
          deliveries: 20n,
        },
      ]);

    const result = await service.detail(companyUser, 'customer-a');

    expect(result.statistics).toEqual({
      totalDeliveries: 37,
      lastDeliveryAt: '2026-08-26T12:00:00.000Z',
      inProgressDeliveries: 2,
      completedDeliveries: 34,
      cancelledDeliveries: 1,
      mostUsedAddresses: [
        {
          address: 'Rua das Flores, 100, Lajinha/MG',
          savedAddressLabel: 'Casa',
          deliveries: 20,
        },
      ],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('nao revela cliente de outra empresa por ID manipulado', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(null);

    await expect(service.detail(companyUser, 'customer-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.companyCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-b', companyId: 'company-a' },
      include: { savedAddresses: { orderBy: [{ isPrimary: 'desc' }, { label: 'asc' }] } },
    });
  });

  it('atualiza cliente, principal e vinculos por telefone antigo e novo', async () => {
    prisma.companyCustomer.findFirst
      .mockResolvedValueOnce({ id: 'customer-a', phone: payload.phone })
      .mockResolvedValueOnce(null);
    prisma.companyCustomer.update.mockResolvedValue(customerRow);

    await service.update(companyUser, 'customer-a', payload);

    expect(prisma.companyCustomer.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'customer-a', companyId: 'company-a' },
      select: { id: true, phone: true },
    });
    expect(prisma.companyCustomer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-a' },
        data: expect.objectContaining({
          savedAddresses: {
            updateMany: expect.objectContaining({ where: { isPrimary: true } }),
          },
        }),
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('cadastra endereco adicional apenas depois de confirmar a empresa', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue({ id: 'customer-a' });
    prisma.companyCustomerSavedAddress.create.mockResolvedValue({
      ...savedAddressRow,
      id: 'address-b',
      label: 'Trabalho',
      normalizedLabel: 'trabalho',
      isPrimary: false,
    });

    const result = await service.createAddress(companyUser, 'customer-a', {
      label: 'Trabalho',
      address: payload.address,
    });

    expect(prisma.companyCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-a', companyId: 'company-a' },
      select: { id: true },
    });
    expect(result).toEqual(expect.objectContaining({ label: 'Trabalho', isPrimary: false }));
  });

  it('nao permite excluir o endereco principal', async () => {
    prisma.companyCustomerSavedAddress.findFirst.mockResolvedValue({
      id: 'address-a',
      isPrimary: true,
    });

    await expect(
      service.removeAddress(companyUser, 'customer-a', 'address-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.companyCustomerSavedAddress.deleteMany).not.toHaveBeenCalled();
  });

  it('nao altera endereco de cliente de outra empresa', async () => {
    prisma.companyCustomerSavedAddress.findFirst.mockResolvedValue(null);

    await expect(
      service.updateAddress(companyUser, 'customer-b', 'address-b', {
        label: 'Loja',
        address: payload.address,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyCustomerSavedAddress.update).not.toHaveBeenCalled();
  });

  it('exclui cliente de forma atomica usando ID e empresa no mesmo filtro', async () => {
    prisma.companyCustomer.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove(companyUser, 'customer-a')).resolves.toEqual({ deleted: true });
    expect(prisma.companyCustomer.deleteMany).toHaveBeenCalledWith({
      where: { id: 'customer-a', companyId: 'company-a' },
    });
  });
});
