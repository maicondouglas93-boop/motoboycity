import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReplaceDriverServiceTypesPayload } from '@motoboycity/validation';
import type { Driver, DriverAccountStatus, DriverApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface DriverServiceTypeItem {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface AdminDriverListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  approvalStatus: string;
  accountStatus: string;
  createdAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  serviceTypes: DriverServiceTypeItem[];
}

export interface DriverReviewResult {
  driverId: string;
  approvalStatus: string;
  reviewedByUserId: string;
  reviewedAt: string;
}

export interface DriverAccountStatusResult {
  driverId: string;
  accountStatus: string;
}

export interface DriverServiceTypesResult {
  driverId: string;
  serviceTypes: DriverServiceTypeItem[];
}

export interface ListDriversFilters {
  approvalStatus?: DriverApprovalStatus;
  accountStatus?: DriverAccountStatus;
}

@Injectable()
export class AdminDriversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ListDriversFilters): Promise<AdminDriverListItem[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        ...(filters.approvalStatus && { approvalStatus: filters.approvalStatus }),
        ...(filters.accountStatus && { accountStatus: filters.accountStatus }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        reviewedBy: true,
        serviceTypes: { include: { serviceType: true }, orderBy: { serviceType: { name: 'asc' } } },
      },
    });

    return drivers.map((driver) => ({
      id: driver.id,
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.user.phone,
      cpf: driver.cpf,
      approvalStatus: driver.approvalStatus,
      accountStatus: driver.accountStatus,
      createdAt: driver.createdAt.toISOString(),
      reviewedBy: driver.reviewedBy
        ? { id: driver.reviewedBy.id, name: driver.reviewedBy.name }
        : null,
      reviewedAt: driver.reviewedAt?.toISOString() ?? null,
      serviceTypes: driver.serviceTypes.map((assignment) =>
        this.toServiceTypeItem(assignment.serviceType, assignment.isPrimary),
      ),
    }));
  }

  async approve(driverId: string, reviewedByUserId: string): Promise<DriverReviewResult> {
    const driver = await this.findOrThrow(driverId);
    if (driver.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Este motoboy não está aguardando aprovação (status atual: ${driver.approvalStatus}).`,
      );
    }
    return this.review(driverId, 'APPROVED', reviewedByUserId);
  }

  async reject(driverId: string, reviewedByUserId: string): Promise<DriverReviewResult> {
    const driver = await this.findOrThrow(driverId);
    if (driver.approvalStatus !== 'PENDING') {
      throw new ConflictException(
        `Este motoboy não está aguardando aprovação (status atual: ${driver.approvalStatus}).`,
      );
    }
    return this.review(driverId, 'REJECTED', reviewedByUserId);
  }

  async suspend(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'SUSPENDED');
  }

  async block(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'BLOCKED');
  }

  async reactivate(driverId: string): Promise<DriverAccountStatusResult> {
    return this.setAccountStatus(driverId, 'ACTIVE');
  }

  async replaceServiceTypes(
    driverId: string,
    payload: ReplaceDriverServiceTypesPayload,
  ): Promise<DriverServiceTypesResult> {
    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: driverId } });
      if (!driver) {
        throw new NotFoundException('Motoboy não encontrado.');
      }

      const serviceTypes = await tx.serviceType.findMany({
        where: { id: { in: payload.serviceTypeIds }, active: true },
      });
      if (serviceTypes.length !== payload.serviceTypeIds.length) {
        throw new ConflictException(
          'Todas as modalidades devem existir e estar ativas para serem atribuídas.',
        );
      }

      const byId = new Map(serviceTypes.map((serviceType) => [serviceType.id, serviceType]));
      const orderedServiceTypes = payload.serviceTypeIds.map((id) => byId.get(id)!);

      await tx.driverServiceType.deleteMany({ where: { driverId } });
      await tx.driverServiceType.createMany({
        data: orderedServiceTypes.map((serviceType, index) => ({
          driverId,
          serviceTypeId: serviceType.id,
          isPrimary: index === 0,
        })),
      });

      return {
        driverId,
        serviceTypes: orderedServiceTypes.map((serviceType, index) =>
          this.toServiceTypeItem(serviceType, index === 0),
        ),
      };
    });
  }

  private async review(
    driverId: string,
    approvalStatus: 'APPROVED' | 'REJECTED',
    reviewedByUserId: string,
  ): Promise<DriverReviewResult> {
    const reviewedAt = new Date();
    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: { approvalStatus, reviewedByUserId, reviewedAt },
    });

    return {
      driverId: updated.id,
      approvalStatus: updated.approvalStatus,
      reviewedByUserId,
      reviewedAt: reviewedAt.toISOString(),
    };
  }

  private async setAccountStatus(
    driverId: string,
    accountStatus: DriverAccountStatus,
  ): Promise<DriverAccountStatusResult> {
    const driver = await this.findOrThrow(driverId);

    if (accountStatus !== 'ACTIVE' && driver.approvalStatus !== 'APPROVED') {
      throw new ConflictException('Só é possível suspender ou bloquear um motoboy aprovado.');
    }
    if (driver.accountStatus === accountStatus) {
      throw new ConflictException(`Este motoboy já está com status de conta "${accountStatus}".`);
    }

    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: { accountStatus },
    });

    return { driverId: updated.id, accountStatus: updated.accountStatus };
  }

  private async findOrThrow(driverId: string): Promise<Driver> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Motoboy não encontrado.');
    }
    return driver;
  }

  private toServiceTypeItem(
    serviceType: { id: string; code: string; name: string },
    isPrimary: boolean,
  ): DriverServiceTypeItem {
    return { id: serviceType.id, code: serviceType.code, name: serviceType.name, isPrimary };
  }
}
