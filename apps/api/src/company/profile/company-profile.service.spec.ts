import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyProfileService } from './company-profile.service';

const owner = {
  id: 'user-1',
  type: 'COMPANY_MEMBER',
  name: 'Maria Responsável',
  email: 'maria@example.com',
  phone: '33999990000',
} as User;

const payload = {
  tradeName: 'Mercado Central',
  legalName: 'Mercado Central LTDA',
  whatsapp: '33988887777',
  fullName: 'Maria da Silva',
};

describe('CompanyProfileService', () => {
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    companyTeamMember: { findFirst: jest.Mock };
    company: { update: jest.Mock };
    user: { update: jest.Mock };
  };
  let service: CompanyProfileService;

  beforeEach(() => {
    tx = {
      companyTeamMember: { findFirst: jest.fn() },
      company: { update: jest.fn() },
      user: { update: jest.fn() },
    };
    prisma = {
      companyTeamMember: { findFirst: jest.fn() },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    service = new CompanyProfileService(prisma as unknown as PrismaService);
  });

  it('retorna os dados da empresa e do usuário autenticado', async () => {
    prisma.companyTeamMember.findFirst.mockResolvedValue({
      role: 'OWNER',
      company: {
        id: 'company-1',
        tradeName: 'Mercado Antigo',
        legalName: 'Mercado Antigo LTDA',
        document: '12345678000199',
      },
    });

    await expect(service.get(owner)).resolves.toEqual({
      companyId: 'company-1',
      tradeName: 'Mercado Antigo',
      legalName: 'Mercado Antigo LTDA',
      document: '12345678000199',
      fullName: owner.name,
      email: owner.email,
      whatsapp: owner.phone,
      canEdit: true,
    });
  });

  it('permite que um operador visualize, mas informa que ele não pode editar', async () => {
    prisma.companyTeamMember.findFirst.mockResolvedValue({
      role: 'OPERATOR',
      company: {
        id: 'company-1',
        tradeName: 'Mercado Antigo',
        legalName: 'Mercado Antigo LTDA',
        document: '12345678000199',
      },
    });

    await expect(service.get(owner)).resolves.toMatchObject({ canEdit: false });
  });

  it('atualiza empresa e responsável na mesma transação', async () => {
    tx.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'company-1' });
    tx.company.update.mockResolvedValue({
      id: 'company-1',
      tradeName: payload.tradeName,
      legalName: payload.legalName,
      document: '12345678000199',
    });
    tx.user.update.mockResolvedValue({
      name: payload.fullName,
      email: owner.email,
      phone: payload.whatsapp,
    });

    await expect(service.update(owner, payload)).resolves.toEqual({
      companyId: 'company-1',
      tradeName: payload.tradeName,
      legalName: payload.legalName,
      document: '12345678000199',
      fullName: payload.fullName,
      email: owner.email,
      whatsapp: payload.whatsapp,
      canEdit: true,
    });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { tradeName: payload.tradeName, legalName: payload.legalName },
      select: { id: true, tradeName: true, legalName: true, document: true },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: owner.id },
      data: { name: payload.fullName, phone: payload.whatsapp },
      select: { name: true, email: true, phone: true },
    });
  });

  it('impede que um operador altere os dados da empresa', async () => {
    tx.companyTeamMember.findFirst.mockResolvedValue(null);

    await expect(service.update(owner, payload)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.company.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
