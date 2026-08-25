import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateServiceTypePayload, UpdateServiceTypePayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';

export interface ServiceTypeItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

@Injectable()
export class AdminServiceTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

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

  async create(payload: CreateServiceTypePayload, actorUserId: string): Promise<ServiceTypeItem> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.serviceType.findUnique({ where: { code: payload.code } });
      if (existing) {
        throw new ConflictException('Já existe um tipo de serviço com este código.');
      }

      const created = await tx.serviceType.create({
        data: { code: payload.code, name: payload.name },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'SERVICE_TYPE_CREATED',
          entityType: 'SERVICE_TYPE',
          entityId: created.id,
          summary: `Modalidade ${created.name} criada.`,
        },
        tx,
      );

      return this.toItem(created);
    });
  }

  async update(
    id: string,
    payload: UpdateServiceTypePayload,
    actorUserId: string,
  ): Promise<ServiceTypeItem> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.serviceType.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Tipo de serviço não encontrado.');
      }

      const updated = await tx.serviceType.update({
        where: { id },
        data: {
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.active !== undefined && { active: payload.active }),
        },
      });
      const state =
        payload.active === false
          ? { action: 'SERVICE_TYPE_DEACTIVATED', label: 'desativada' }
          : payload.active === true
            ? { action: 'SERVICE_TYPE_REACTIVATED', label: 'reativada' }
            : { action: 'SERVICE_TYPE_UPDATED', label: 'atualizada' };
      await this.audit.record(
        {
          actorUserId,
          action: state.action,
          entityType: 'SERVICE_TYPE',
          entityId: updated.id,
          summary: `Modalidade ${updated.name} ${state.label}.`,
        },
        tx,
      );

      return this.toItem(updated);
    });
  }

  private toItem(serviceType: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    createdAt: Date;
  }): ServiceTypeItem {
    return {
      id: serviceType.id,
      code: serviceType.code,
      name: serviceType.name,
      active: serviceType.active,
      createdAt: serviceType.createdAt.toISOString(),
    };
  }
}
