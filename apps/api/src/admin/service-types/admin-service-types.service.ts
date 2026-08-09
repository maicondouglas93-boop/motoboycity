import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateServiceTypePayload, UpdateServiceTypePayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';

export interface ServiceTypeItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

@Injectable()
export class AdminServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { active?: boolean }): Promise<ServiceTypeItem[]> {
    const serviceTypes = await this.prisma.serviceType.findMany({
      where: filters.active === undefined ? undefined : { active: filters.active },
      orderBy: { createdAt: 'asc' },
    });

    return serviceTypes.map((serviceType) => ({
      id: serviceType.id,
      code: serviceType.code,
      name: serviceType.name,
      active: serviceType.active,
      createdAt: serviceType.createdAt.toISOString(),
    }));
  }

  async create(payload: CreateServiceTypePayload): Promise<ServiceTypeItem> {
    const existing = await this.prisma.serviceType.findUnique({ where: { code: payload.code } });
    if (existing) {
      throw new ConflictException('Já existe um tipo de serviço com este código.');
    }

    const created = await this.prisma.serviceType.create({
      data: { code: payload.code, name: payload.name },
    });

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      active: created.active,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async update(id: string, payload: UpdateServiceTypePayload): Promise<ServiceTypeItem> {
    const existing = await this.prisma.serviceType.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tipo de serviço não encontrado.');
    }

    const updated = await this.prisma.serviceType.update({
      where: { id },
      data: {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.active !== undefined && { active: payload.active }),
      },
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      active: updated.active,
      createdAt: updated.createdAt.toISOString(),
    };
  }
}
