import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CompanyCustomer } from '@motoboycity/types';
import type {
  CreateCompanyCustomerPayload,
  ListCompanyCustomersQuery,
  MatchCompanyCustomerQuery,
  UpdateCompanyCustomerPayload,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface CustomerRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: { toString(): string } | null;
  lng: { toString(): string } | null;
  referenceNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeCustomerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class CompanyCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: User,
    query: ListCompanyCustomersQuery,
  ): Promise<{ items: CompanyCustomer[]; total: number; page: number; pageSize: number }> {
    const companyId = await this.resolveCompanyId(user);
    const digits = query.q?.replace(/\D/g, '') ?? '';
    const normalizedQuery = query.q ? normalizeCustomerName(query.q) : '';
    const search = query.q
      ? {
          OR: [
            { normalizedName: { contains: normalizedQuery } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {};
    const where: Prisma.CompanyCustomerWhereInput = { companyId, ...search };

    const [rows, total] = await Promise.all([
      this.prisma.companyCustomer.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.companyCustomer.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(user: User, id: string): Promise<CompanyCustomer> {
    const companyId = await this.resolveCompanyId(user);
    const customer = await this.prisma.companyCustomer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
    return this.toItem(customer);
  }

  async match(
    user: User,
    identifiers: MatchCompanyCustomerQuery,
  ): Promise<{ customer: CompanyCustomer | null }> {
    const companyId = await this.resolveCompanyId(user);
    const matches = await this.prisma.companyCustomer.findMany({
      where: {
        companyId,
        OR: [
          ...(identifiers.cpf ? [{ cpf: identifiers.cpf }] : []),
          ...(identifiers.phone ? [{ phone: identifiers.phone }] : []),
        ],
      },
      take: 2,
    });
    if (matches.length > 1) {
      throw new ConflictException('O CPF e o telefone pertencem a clientes diferentes.');
    }
    return { customer: matches[0] ? this.toItem(matches[0]) : null };
  }

  async create(user: User, payload: CreateCompanyCustomerPayload): Promise<CompanyCustomer> {
    const companyId = await this.resolveCompanyId(user);
    await this.assertNoDuplicate(companyId, payload.cpf, payload.phone);

    try {
      const customer = await this.prisma.companyCustomer.create({
        data: {
          companyId,
          name: payload.name,
          normalizedName: normalizeCustomerName(payload.name),
          cpf: payload.cpf,
          phone: payload.phone,
          ...this.addressData(payload.address),
        },
      });
      return this.toItem(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    user: User,
    id: string,
    payload: UpdateCompanyCustomerPayload,
  ): Promise<CompanyCustomer> {
    const companyId = await this.resolveCompanyId(user);
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Cliente nao encontrado.');

    await this.assertNoDuplicate(companyId, payload.cpf, payload.phone, id);
    try {
      const customer = await this.prisma.companyCustomer.update({
        where: { id },
        data: {
          name: payload.name,
          normalizedName: normalizeCustomerName(payload.name),
          cpf: payload.cpf,
          phone: payload.phone,
          ...this.addressData(payload.address),
        },
      });
      return this.toItem(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async remove(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.resolveCompanyId(user);
    const result = await this.prisma.companyCustomer.deleteMany({ where: { id, companyId } });
    if (result.count !== 1) throw new NotFoundException('Cliente nao encontrado.');
    return { deleted: true };
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuario nao esta vinculado a uma empresa ativa.');
    }
    return membership.companyId;
  }

  private async assertNoDuplicate(
    companyId: string,
    cpf: string,
    phone: string,
    excludedId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.companyCustomer.findFirst({
      where: {
        companyId,
        ...(excludedId && { id: { not: excludedId } }),
        OR: [{ cpf }, { phone }],
      },
      select: { cpf: true, phone: true },
    });
    if (!duplicate) return;
    if (duplicate.cpf === cpf) throw new ConflictException('Ja existe um cliente com este CPF.');
    throw new ConflictException('Ja existe um cliente com este telefone.');
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ja existe um cliente com este CPF ou telefone.');
    }
  }

  private addressData(address: CreateCompanyCustomerPayload['address']) {
    return {
      street: address.street,
      number: address.number,
      complement: address.complement ?? null,
      city: address.city,
      state: address.state.toUpperCase(),
      zip: address.zip.replace(/\D/g, ''),
      lat: address.lat ?? null,
      lng: address.lng ?? null,
      referenceNote: address.referenceNote ?? null,
    };
  }

  private toItem(customer: CustomerRow): CompanyCustomer {
    return {
      id: customer.id,
      name: customer.name,
      cpf: customer.cpf,
      phone: customer.phone,
      address: {
        street: customer.street,
        number: customer.number,
        complement: customer.complement,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        lat: customer.lat === null ? null : Number(customer.lat),
        lng: customer.lng === null ? null : Number(customer.lng),
        referenceNote: customer.referenceNote,
      },
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
