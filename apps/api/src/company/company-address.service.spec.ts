import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyAddressService } from './company-address.service';

const companyUser = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
const driverUser = { id: 'user-2', type: 'DRIVER' } as User;

const payload = {
  street: 'Rua da Loja',
  number: '100',
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
};

describe('CompanyAddressService', () => {
  let service: CompanyAddressService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    companyAddress: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn() },
      companyAddress: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CompanyAddressService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CompanyAddressService);
  });

  describe('get', () => {
    it('retorna null quando a empresa ainda não tem endereço', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'company-1' });
      prisma.companyAddress.findFirst.mockResolvedValue(null);

      const result = await service.get(companyUser);

      expect(result).toBeNull();
    });

    it('rejeita acesso de quem não é membro de empresa', async () => {
      await expect(service.get(driverUser)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('upsert', () => {
    it('cria o endereço quando não existe nenhum ainda', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'company-1' });
      prisma.companyAddress.findFirst.mockResolvedValue(null);
      prisma.companyAddress.create.mockResolvedValue({
        id: 'addr-1',
        label: null,
        complement: null,
        ...payload,
      });

      const result = await service.upsert(companyUser, payload);

      expect(prisma.companyAddress.create).toHaveBeenCalledWith({
        data: { ...payload, companyId: 'company-1', isPrimary: true },
      });
      expect(result.id).toBe('addr-1');
    });

    it('atualiza o endereço existente em vez de criar um novo', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'company-1' });
      prisma.companyAddress.findFirst.mockResolvedValue({ id: 'addr-1' });
      prisma.companyAddress.update.mockResolvedValue({
        id: 'addr-1',
        label: null,
        complement: null,
        ...payload,
      });

      await service.upsert(companyUser, payload);

      expect(prisma.companyAddress.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: payload,
      });
      expect(prisma.companyAddress.create).not.toHaveBeenCalled();
    });
  });
});
