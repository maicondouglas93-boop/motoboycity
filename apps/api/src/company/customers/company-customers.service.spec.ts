import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyCustomersService } from './company-customers.service';

const companyUser = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;
const payload = {
  name: 'Joao da Silva',
  cpf: '52998224725',
  phone: '33999999991',
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
  createdAt: new Date('2026-08-26T12:00:00.000Z'),
  updatedAt: new Date('2026-08-26T12:00:00.000Z'),
};

describe('CompanyCustomersService', () => {
  let service: CompanyCustomersService;
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
    };
    const module = await Test.createTestingModule({
      providers: [CompanyCustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CompanyCustomersService);
  });

  it('cria cliente normalizado e vinculado somente a empresa da sessao', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    prisma.companyCustomer.create.mockResolvedValue(customerRow);

    const result = await service.create(companyUser, payload);

    expect(prisma.companyCustomer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-a',
        normalizedName: 'joao da silva',
        cpf: payload.cpf,
        phone: payload.phone,
      }),
    });
    expect(result.id).toBe('customer-a');
    expect(result.address.lat).toBe(-20.15);
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
      }),
    );
    expect(result.total).toBe(1);
  });

  it('nao revela cliente de outra empresa por ID manipulado', async () => {
    prisma.companyCustomer.findFirst.mockResolvedValue(null);
    await expect(service.detail(companyUser, 'customer-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.companyCustomer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-b', companyId: 'company-a' },
    });
  });

  it('atualiza somente depois de confirmar propriedade e ausencia de duplicidade', async () => {
    prisma.companyCustomer.findFirst
      .mockResolvedValueOnce({ id: 'customer-a' })
      .mockResolvedValueOnce(null);
    prisma.companyCustomer.update.mockResolvedValue(customerRow);

    await service.update(companyUser, 'customer-a', payload);

    expect(prisma.companyCustomer.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'customer-a', companyId: 'company-a' },
      select: { id: true },
    });
    expect(prisma.companyCustomer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'customer-a' } }),
    );
  });

  it('exclui de forma atomica usando ID e empresa no mesmo filtro', async () => {
    prisma.companyCustomer.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(companyUser, 'customer-a')).resolves.toEqual({ deleted: true });
    expect(prisma.companyCustomer.deleteMany).toHaveBeenCalledWith({
      where: { id: 'customer-a', companyId: 'company-a' },
    });
  });
});
