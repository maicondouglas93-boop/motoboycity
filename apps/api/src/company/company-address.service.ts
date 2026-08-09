import { ForbiddenException, Injectable } from '@nestjs/common';
import type { UpsertCompanyAddressPayload } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CompanyAddressItem {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
}

@Injectable()
export class CompanyAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: User): Promise<CompanyAddressItem | null> {
    const companyId = await this.resolveCompanyId(user);
    const address = await this.prisma.companyAddress.findFirst({
      where: { companyId, isPrimary: true },
    });
    return address ? this.toItem(address) : null;
  }

  async upsert(user: User, payload: UpsertCompanyAddressPayload): Promise<CompanyAddressItem> {
    const companyId = await this.resolveCompanyId(user);

    const existing = await this.prisma.companyAddress.findFirst({
      where: { companyId, isPrimary: true },
    });

    const address = existing
      ? await this.prisma.companyAddress.update({ where: { id: existing.id }, data: payload })
      : await this.prisma.companyAddress.create({
          data: { ...payload, companyId, isPrimary: true },
        });

    return this.toItem(address);
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id },
    });
    if (!membership) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    return membership.companyId;
  }

  private toItem(address: {
    id: string;
    label: string | null;
    street: string;
    number: string;
    complement: string | null;
    city: string;
    state: string;
    zip: string;
  }): CompanyAddressItem {
    return {
      id: address.id,
      label: address.label,
      street: address.street,
      number: address.number,
      complement: address.complement,
      city: address.city,
      state: address.state,
      zip: address.zip,
    };
  }
}
