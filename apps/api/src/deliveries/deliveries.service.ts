import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CreateDeliveryPayload } from '@motoboycity/validation';
import type { Delivery, DeliveryStatus, User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { PricingService } from '../pricing/pricing.service';
import { GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PrismaService } from '../prisma/prisma.service';

const COMPANY_CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];

export interface DeliveryAddressItem {
  type: string;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  referenceNote: string | null;
}

export interface DeliveryListItem {
  id: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  serviceTypeName: string;
  status: DeliveryStatus;
  distanceKm: number | null;
  totalValue: number;
  driverValue: number;
  platformValue: number;
  requiresReturn: boolean;
  returnValue: number | null;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly googleMapsService: GoogleMapsService,
    private readonly dispatchService: DispatchService,
  ) {}

  async create(user: User, payload: CreateDeliveryPayload): Promise<DeliveryDetail> {
    const company = await this.findCompanyForUser(user);
    if (!company) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    if (company.status !== 'ACTIVE') {
      throw new ForbiddenException('Sua empresa precisa estar aprovada para lançar pedidos.');
    }

    const pickupAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId: company.id, isPrimary: true },
    });
    if (!pickupAddress) {
      throw new ConflictException('A empresa ainda não tem um endereço de coleta cadastrado.');
    }

    const pickupText = this.formatAddress(pickupAddress);
    const dropoffText = this.formatAddress(payload.dropoffAddress);

    let distanceKm: number;
    try {
      const distance = await this.googleMapsService.getDistance({
        origin: { address: pickupText },
        destination: { address: dropoffText },
      });
      distanceKm = distance.distanceKm;
    } catch (error) {
      if (error instanceof GoogleMapsNotConfiguredError) {
        throw new InternalServerErrorException(
          'Cálculo de distância não está configurado. Contate o suporte.',
        );
      }
      throw new ServiceUnavailableException(
        'Não foi possível calcular a distância deste pedido agora. Tente novamente em instantes.',
      );
    }

    const quote = await this.pricingService.quote({
      serviceTypeId: payload.serviceTypeId,
      distanceKm,
      requiresReturn: payload.requiresReturn ?? false,
    });

    const initialStatus: DeliveryStatus = payload.scheduledAt ? 'SCHEDULED' : 'AWAITING_DRIVER';
    if (initialStatus === 'AWAITING_DRIVER') {
      await this.dispatchService.assertConfigured();
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          companyId: company.id,
          serviceTypeId: payload.serviceTypeId,
          status: initialStatus,
          scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
          distanceKm,
          totalValue: quote.totalValue,
          driverValue: quote.driverValue,
          platformValue: quote.platformValue,
          paymentMethod: 'BILLED',
          requiresDeliveryProof: payload.requiresDeliveryProof ?? false,
          requiresCollectionRecipient: payload.requiresCollectionRecipient ?? false,
          pickupSurchargeChargedToDriver: payload.pickupSurchargeChargedToDriver ?? false,
          requiresReturn: payload.requiresReturn ?? false,
          returnValue: quote.returnValue > 0 ? quote.returnValue : null,
        },
      });

      await tx.deliveryAddress.createMany({
        data: [
          {
            deliveryId: delivery.id,
            type: 'PICKUP',
            street: pickupAddress.street,
            number: pickupAddress.number,
            complement: pickupAddress.complement,
            city: pickupAddress.city,
            state: pickupAddress.state,
            zip: pickupAddress.zip,
            lat: pickupAddress.lat,
            lng: pickupAddress.lng,
          },
          {
            deliveryId: delivery.id,
            type: 'DROPOFF',
            street: payload.dropoffAddress.street,
            number: payload.dropoffAddress.number,
            complement: payload.dropoffAddress.complement,
            city: payload.dropoffAddress.city,
            state: payload.dropoffAddress.state,
            zip: payload.dropoffAddress.zip,
            referenceNote: payload.dropoffAddress.referenceNote,
          },
        ],
      });

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: null,
          toStatus: initialStatus,
          changedByUserId: user.id,
        },
      });

      return delivery;
    });

    if (initialStatus === 'AWAITING_DRIVER') {
      await this.dispatchService.dispatchDelivery(created.id);
    } else {
      await this.dispatchService.scheduleActivation(created.id, new Date(payload.scheduledAt!));
    }

    return this.detail(user, created.id);
  }

  async list(user: User, filters: { status?: DeliveryStatus }): Promise<DeliveryListItem[]> {
    const companyId = await this.resolveScopeCompanyId(user);

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        ...(companyId && { companyId }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
      include: { company: true, serviceType: true },
    });

    return deliveries.map((delivery) => this.toListItem(delivery));
  }

  async detail(user: User, id: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { company: true, serviceType: true, addresses: true },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    await this.assertCanAccess(user, delivery);

    return {
      ...this.toListItem(delivery),
      addresses: delivery.addresses.map((address) => ({
        type: address.type,
        street: address.street,
        number: address.number,
        complement: address.complement,
        city: address.city,
        state: address.state,
        zip: address.zip,
        referenceNote: address.referenceNote,
      })),
    };
  }

  async cancel(user: User, id: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    await this.assertCanAccess(user, delivery);

    if (delivery.status === 'CANCELLED') {
      throw new ConflictException('Este pedido já está cancelado.');
    }
    if (delivery.status === 'COMPLETED') {
      throw new ConflictException('Este pedido já foi concluído e não pode ser cancelado.');
    }
    if (
      user.type === 'COMPANY_MEMBER' &&
      !COMPANY_CANCELLABLE_STATUSES.includes(delivery.status)
    ) {
      throw new ConflictException(
        'A empresa só pode cancelar o pedido enquanto nenhum entregador tiver aceitado.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id },
        data: { status: 'CANCELLED', statusChangedAt: new Date() },
      });
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: id,
          fromStatus: delivery.status,
          toStatus: 'CANCELLED',
          changedByUserId: user.id,
        },
      });
    });

    if (delivery.status === 'SCHEDULED') {
      await this.dispatchService.cancelScheduledActivation(id);
    } else {
      await this.dispatchService.cancelPendingOfferForDelivery(id);
    }

    return this.detail(user, id);
  }

  private async assertCanAccess(user: User, delivery: Delivery): Promise<void> {
    if (user.type === 'ADMIN') {
      return;
    }
    if (user.type === 'COMPANY_MEMBER') {
      const company = await this.findCompanyForUser(user);
      if (!company || company.id !== delivery.companyId) {
        throw new ForbiddenException('Você não tem acesso a este pedido.');
      }
      return;
    }
    throw new ForbiddenException('Acesso restrito a empresas e administradores.');
  }

  private async resolveScopeCompanyId(user: User): Promise<string | undefined> {
    if (user.type === 'ADMIN') {
      return undefined;
    }
    if (user.type === 'COMPANY_MEMBER') {
      const company = await this.findCompanyForUser(user);
      if (!company) {
        throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
      }
      return company.id;
    }
    throw new ForbiddenException('Acesso restrito a empresas e administradores.');
  }

  private async findCompanyForUser(user: User): Promise<{ id: string; status: string } | null> {
    if (user.type !== 'COMPANY_MEMBER') {
      return null;
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id },
      include: { company: true },
    });
    if (!membership) {
      return null;
    }
    return { id: membership.company.id, status: membership.company.status };
  }

  private formatAddress(address: {
    street: string;
    number: string;
    complement?: string | null;
    city: string;
    state: string;
    zip: string;
  }): string {
    const complementPart = address.complement ? ` - ${address.complement}` : '';
    return `${address.street}, ${address.number}${complementPart}, ${address.city} - ${address.state}, ${address.zip}`;
  }

  private toListItem(delivery: {
    id: string;
    displayNumber: number;
    companyId: string;
    company: { tradeName: string };
    serviceType: { name: string };
    status: DeliveryStatus;
    distanceKm: { toString(): string } | null;
    totalValue: { toString(): string };
    driverValue: { toString(): string };
    platformValue: { toString(): string };
    requiresReturn: boolean;
    returnValue: { toString(): string } | null;
    scheduledAt: Date | null;
    createdAt: Date;
  }): DeliveryListItem {
    return {
      id: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      companyName: delivery.company.tradeName,
      serviceTypeName: delivery.serviceType.name,
      status: delivery.status,
      distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
      totalValue: Number(delivery.totalValue),
      driverValue: Number(delivery.driverValue),
      platformValue: Number(delivery.platformValue),
      requiresReturn: delivery.requiresReturn,
      returnValue: delivery.returnValue === null ? null : Number(delivery.returnValue),
      scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    };
  }
}
