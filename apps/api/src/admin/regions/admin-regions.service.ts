import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminRegion } from '@motoboycity/types';
import type { AdminRegionPayload } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';

@Injectable()
export class AdminRegionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(): Promise<AdminRegion[]> {
    const regions = await this.prisma.region.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { companies: true, drivers: true } } },
    });
    return regions.map((region) => ({
      id: region.id,
      name: region.name,
      maxDeliveryDistanceKm:
        region.maxDeliveryDistanceKm === null ? null : Number(region.maxDeliveryDistanceKm),
      active: region.active,
      companyCount: region._count.companies,
      driverCount: region._count.drivers,
      createdAt: region.createdAt.toISOString(),
    }));
  }

  async create(payload: AdminRegionPayload, actorUserId: string): Promise<AdminRegion> {
    const id = await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.region.findUnique({
        where: { name: payload.name },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Ja existe uma regiao com este nome.');
      const region = await tx.region.create({ data: payload });
      await this.audit.record(
        {
          actorUserId,
          action: 'REGION_CREATED',
          entityType: 'REGION',
          entityId: region.id,
          summary: `Regiao ${payload.name} criada.`,
        },
        tx,
      );
      return region.id;
    });
    return (await this.list()).find((region) => region.id === id)!;
  }

  async update(id: string, payload: AdminRegionPayload, actorUserId: string): Promise<AdminRegion> {
    await this.prisma.$transaction(async (tx) => {
      const region = await tx.region.findUnique({ where: { id }, select: { id: true } });
      if (!region) throw new NotFoundException('Regiao nao encontrada.');
      const duplicate = await tx.region.findFirst({
        where: { name: payload.name, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Ja existe uma regiao com este nome.');
      await tx.region.update({ where: { id }, data: payload });
      await this.audit.record(
        {
          actorUserId,
          action: 'REGION_UPDATED',
          entityType: 'REGION',
          entityId: id,
          summary: `Regiao ${payload.name} atualizada.`,
        },
        tx,
      );
    });
    return (await this.list()).find((region) => region.id === id)!;
  }

  async setActive(id: string, active: boolean, actorUserId: string): Promise<AdminRegion> {
    await this.prisma.$transaction(async (tx) => {
      const region = await tx.region.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              companies: { where: { status: 'ACTIVE' } },
              drivers: { where: { accountStatus: 'ACTIVE' } },
            },
          },
        },
      });
      if (!region) throw new NotFoundException('Regiao nao encontrada.');
      if (region.active === active)
        throw new ConflictException(`A regiao ja esta ${active ? 'ativa' : 'inativa'}.`);
      if (!active && (region._count.companies > 0 || region._count.drivers > 0)) {
        throw new ConflictException(
          'Mova ou suspenda empresas e motoboys ativos antes de desativar esta regiao.',
        );
      }
      await tx.region.update({ where: { id }, data: { active } });
      await this.audit.record(
        {
          actorUserId,
          action: active ? 'REGION_REACTIVATED' : 'REGION_DEACTIVATED',
          entityType: 'REGION',
          entityId: id,
          summary: `Regiao ${region.name} ${active ? 'reativada' : 'desativada'}.`,
        },
        tx,
      );
    });
    return (await this.list()).find((region) => region.id === id)!;
  }
}
