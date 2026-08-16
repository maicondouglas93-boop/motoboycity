import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CompleteReturnPayload,
  CreateDeliveryBatchPayload,
  CreateDeliveryPayload,
  MarkDeliveredPayload,
} from '@motoboycity/validation';
import type { Delivery, DeliveryStatus, Prisma, User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { haversineDistanceMeters } from '../common/haversine';
import { DispatchService } from '../dispatch/dispatch.service';
import { PricingService } from '../pricing/pricing.service';
import { GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PrismaService } from '../prisma/prisma.service';

const COMPANY_CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];

export interface DeliveryAddressItem {
  type: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  referenceNote: string | null;
}

export interface DeliveryListItem {
  id: string;
  displayNumber: number;
  companyId: string;
  companyName: string;
  batchId: string | null;
  serviceTypeName: string;
  status: DeliveryStatus;
  destinationKnownAtCreation: boolean;
  distanceKm: number | null;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  requiresReturn: boolean;
  returnValue: number | null;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
}

export interface DeliveryBatchDetail {
  batchId: string;
  deliveries: DeliveryDetail[];
}

export interface DeliveryGroupResult {
  batchId: string | null;
  deliveries: DeliveryDetail[];
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly googleMapsService: GoogleMapsService,
    private readonly dispatchService: DispatchService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
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

    const destinationKnownAtCreation = payload.destinationKnownAtCreation ?? true;

    let distanceKm: number | null = null;
    let totalValue: number | null = null;
    let driverValue: number | null = null;
    let platformValue: number | null = null;
    let returnValue: number | null = null;

    if (destinationKnownAtCreation) {
      const dropoffAddress = payload.dropoffAddress!;
      try {
        const distance = await this.googleMapsService.getDistance({
          origin: { address: this.formatAddress(pickupAddress) },
          destination: { address: this.formatAddress(dropoffAddress) },
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
      totalValue = quote.totalValue;
      driverValue = quote.driverValue;
      platformValue = quote.platformValue;
      returnValue = quote.returnValue > 0 ? quote.returnValue : null;
    }

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
          destinationKnownAtCreation,
          distanceKm,
          totalValue,
          driverValue,
          platformValue,
          paymentMethod: 'BILLED',
          requiresDeliveryProof: payload.requiresDeliveryProof ?? false,
          requiresCollectionRecipient: payload.requiresCollectionRecipient ?? false,
          pickupSurchargeChargedToDriver: payload.pickupSurchargeChargedToDriver ?? false,
          requiresReturn: payload.requiresReturn ?? false,
          returnValue,
        },
      });

      const addresses: Prisma.DeliveryAddressCreateManyInput[] = [
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
      ];
      if (destinationKnownAtCreation) {
        const dropoffAddress = payload.dropoffAddress!;
        addresses.push({
          deliveryId: delivery.id,
          type: 'DROPOFF',
          street: dropoffAddress.street,
          number: dropoffAddress.number,
          complement: dropoffAddress.complement,
          city: dropoffAddress.city,
          state: dropoffAddress.state,
          zip: dropoffAddress.zip,
          referenceNote: dropoffAddress.referenceNote,
        });
      }
      await tx.deliveryAddress.createMany({ data: addresses });

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

  async createBatch(user: User, payload: CreateDeliveryBatchPayload): Promise<DeliveryBatchDetail> {
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
    await this.dispatchService.assertConfigured();

    const prepared = await Promise.all(
      payload.deliveries.map(async (item) => {
        const destinationKnownAtCreation = item.destinationKnownAtCreation ?? true;
        if (!destinationKnownAtCreation) {
          return { item, destinationKnownAtCreation, distanceKm: null, quote: null };
        }

        let distanceKm: number;
        try {
          const distance = await this.googleMapsService.getDistance({
            origin: { address: this.formatAddress(pickupAddress) },
            destination: { address: this.formatAddress(item.dropoffAddress!) },
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
          serviceTypeId: item.serviceTypeId,
          distanceKm,
          requiresReturn: item.requiresReturn ?? false,
        });
        return { item, destinationKnownAtCreation, distanceKm, quote };
      }),
    );

    const batchId = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      const deliveries = [];
      for (const { item, destinationKnownAtCreation, distanceKm, quote } of prepared) {
        const delivery = await tx.delivery.create({
          data: {
            companyId: company.id,
            serviceTypeId: item.serviceTypeId,
            batchId,
            status: 'AWAITING_DRIVER',
            destinationKnownAtCreation,
            distanceKm,
            totalValue: quote ? quote.totalValue : null,
            driverValue: quote ? quote.driverValue : null,
            platformValue: quote ? quote.platformValue : null,
            paymentMethod: 'BILLED',
            requiresDeliveryProof: item.requiresDeliveryProof ?? false,
            requiresCollectionRecipient: item.requiresCollectionRecipient ?? false,
            pickupSurchargeChargedToDriver: item.pickupSurchargeChargedToDriver ?? false,
            requiresReturn: item.requiresReturn ?? false,
            returnValue: quote && quote.returnValue > 0 ? quote.returnValue : null,
          },
        });

        const addresses: Prisma.DeliveryAddressCreateManyInput[] = [
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
        ];
        if (destinationKnownAtCreation) {
          const dropoffAddress = item.dropoffAddress!;
          addresses.push({
            deliveryId: delivery.id,
            type: 'DROPOFF',
            street: dropoffAddress.street,
            number: dropoffAddress.number,
            complement: dropoffAddress.complement,
            city: dropoffAddress.city,
            state: dropoffAddress.state,
            zip: dropoffAddress.zip,
            referenceNote: dropoffAddress.referenceNote,
          });
        }
        await tx.deliveryAddress.createMany({ data: addresses });

        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: delivery.id,
            fromStatus: null,
            toStatus: 'AWAITING_DRIVER',
            changedByUserId: user.id,
          },
        });
        deliveries.push(delivery);
      }
      return deliveries;
    });

    const firstCreated = created[0];
    if (!firstCreated) {
      throw new InternalServerErrorException('Não foi possível criar o lote.');
    }
    await this.dispatchService.dispatchDelivery(firstCreated.id);
    return {
      batchId,
      deliveries: await Promise.all(created.map((delivery) => this.detail(user, delivery.id))),
    };
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
        lat: address.lat === null ? null : Number(address.lat),
        lng: address.lng === null ? null : Number(address.lng),
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

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];

    // Itens já CANCELLED/COMPLETED ficam de fora — sem isto, um item que já
    // fechou sozinho (ex.: entrega sem retorno) travaria o cancelamento dos
    // demais itens do lote, ainda ativos, pra sempre.
    const cancellable = siblings.filter(
      (item) => item.status !== 'CANCELLED' && item.status !== 'COMPLETED',
    );
    if (cancellable.length === 0) {
      throw new ConflictException('Este pedido já está cancelado ou concluído.');
    }
    for (const item of cancellable) {
      if (user.type === 'COMPANY_MEMBER' && !COMPANY_CANCELLABLE_STATUSES.includes(item.status)) {
        throw new ConflictException(
          'A empresa só pode cancelar o lote enquanto nenhum entregador tiver aceitado.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of cancellable) {
        await tx.delivery.update({
          where: { id: item.id },
          data: { status: 'CANCELLED', statusChangedAt: new Date() },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: item.id,
            fromStatus: item.status,
            toStatus: 'CANCELLED',
            changedByUserId: user.id,
          },
        });
      }
    });

    await Promise.all(
      cancellable.map((item) =>
        item.status === 'SCHEDULED'
          ? this.dispatchService.cancelScheduledActivation(item.id)
          : this.dispatchService.cancelPendingOfferForDelivery(item.id),
      ),
    );

    return this.detail(user, id);
  }

  /** Ação única pro lote inteiro — "cheguei na empresa, peguei tudo".
   * Exige que todos os itens estejam ACCEPTED: divergência de status entre
   * itens do mesmo lote só começa a existir depois de coletado. */
  async collect(user: User, id: string): Promise<DeliveryGroupResult> {
    const driver = await this.findDriverForUser(user);
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];
    if (siblings.some((item) => item.status !== 'ACCEPTED')) {
      throw new ConflictException('Todos os itens do pedido precisam estar aceitos para coletar.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of siblings) {
        await tx.delivery.update({
          where: { id: item.id },
          data: { status: 'COLLECTED', statusChangedAt: new Date() },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: item.id,
            fromStatus: 'ACCEPTED',
            toStatus: 'COLLECTED',
            changedByUserId: user.id,
          },
        });
      }
    });

    return {
      batchId: delivery.batchId,
      deliveries: await Promise.all(siblings.map((item) => this.detail(user, item.id))),
    };
  }

  /** Uma entrega por vez — cada item do lote é concluído em local/momento
   * diferente. Quando destinationKnownAtCreation=false, lat/lng do corpo
   * viram o destino: distância e preço são calculados agora, não na criação.
   * Fecha sozinho (COMPLETED) se não exigir retorno; senão fica em
   * DELIVERED até completeReturn(). */
  async markDelivered(user: User, id: string, payload: MarkDeliveredPayload): Promise<DeliveryDetail> {
    const driver = await this.findDriverForUser(user);
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException('O pedido precisa estar coletado antes de ser marcado como entregue.');
    }

    let distanceKm = delivery.distanceKm === null ? null : Number(delivery.distanceKm);
    let totalValue = delivery.totalValue === null ? null : Number(delivery.totalValue);
    let driverValue = delivery.driverValue === null ? null : Number(delivery.driverValue);
    let platformValue = delivery.platformValue === null ? null : Number(delivery.platformValue);
    let returnValue = delivery.returnValue === null ? null : Number(delivery.returnValue);
    let capturedLat: number | null = null;
    let capturedLng: number | null = null;

    if (!delivery.destinationKnownAtCreation) {
      if (payload.lat === undefined || payload.lng === undefined) {
        throw new ConflictException(
          'É necessário informar a localização atual para concluir esta entrega.',
        );
      }
      const pickupAddress = await this.prisma.companyAddress.findFirst({
        where: { companyId: delivery.companyId, isPrimary: true },
      });
      if (!pickupAddress) {
        throw new ConflictException('A empresa não tem mais um endereço de coleta cadastrado.');
      }

      let distance: { distanceKm: number };
      try {
        distance = await this.googleMapsService.getDistance({
          origin: { address: this.formatAddress(pickupAddress) },
          destination: { lat: payload.lat, lng: payload.lng },
        });
      } catch (error) {
        if (error instanceof GoogleMapsNotConfiguredError) {
          throw new InternalServerErrorException(
            'Cálculo de distância não está configurado. Contate o suporte.',
          );
        }
        throw new ServiceUnavailableException(
          'Não foi possível calcular a distância desta entrega agora. Tente novamente em instantes.',
        );
      }

      const quote = await this.pricingService.quote({
        serviceTypeId: delivery.serviceTypeId,
        distanceKm: distance.distanceKm,
        requiresReturn: delivery.requiresReturn,
      });

      distanceKm = distance.distanceKm;
      totalValue = quote.totalValue;
      driverValue = quote.driverValue;
      platformValue = quote.platformValue;
      returnValue = quote.returnValue > 0 ? quote.returnValue : null;
      capturedLat = payload.lat;
      capturedLng = payload.lng;
    }

    const autoComplete = !delivery.requiresReturn;

    await this.prisma.$transaction(async (tx) => {
      if (!delivery.destinationKnownAtCreation) {
        await tx.deliveryAddress.create({
          data: {
            deliveryId: delivery.id,
            type: 'DROPOFF',
            street: null,
            number: null,
            complement: null,
            city: null,
            state: null,
            zip: null,
            lat: capturedLat,
            lng: capturedLng,
          },
        });
      }

      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: autoComplete ? 'COMPLETED' : 'DELIVERED',
          statusChangedAt: new Date(),
          distanceKm,
          totalValue,
          driverValue,
          platformValue,
          returnValue,
        },
      });

      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: 'COLLECTED',
          toStatus: 'DELIVERED',
          changedByUserId: user.id,
        },
      });

      if (autoComplete) {
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: delivery.id,
            fromStatus: 'DELIVERED',
            toStatus: 'COMPLETED',
            changedByUserId: user.id,
          },
        });
      }
    });

    return this.detail(user, delivery.id);
  }

  /** Fecha os itens do lote que exigem retorno e já foram entregues —
   * só quando o motoboy está fisicamente perto do endereço de coleta da
   * empresa (checagem por distância em linha reta, não rota real). */
  async completeReturn(user: User, id: string, payload: CompleteReturnPayload): Promise<DeliveryGroupResult> {
    const driver = await this.findDriverForUser(user);
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }

    const settings = await this.platformSettingsService.get();
    if (settings.returnProximityRadiusMeters === null) {
      throw new ConflictException(
        'O raio de tolerância para fechar o retorno ainda não foi configurado pelo admin.',
      );
    }

    const pickupAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId: delivery.companyId, isPrimary: true },
    });
    if (!pickupAddress || pickupAddress.lat === null || pickupAddress.lng === null) {
      throw new ConflictException('O endereço de coleta da empresa não tem coordenadas cadastradas.');
    }

    const distanceMeters = haversineDistanceMeters(
      { lat: payload.lat, lng: payload.lng },
      { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) },
    );
    if (distanceMeters > settings.returnProximityRadiusMeters) {
      throw new ConflictException(
        `Você precisa estar a até ${settings.returnProximityRadiusMeters}m da empresa para fechar o ` +
          `retorno (está a ${Math.round(distanceMeters)}m).`,
      );
    }

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];
    const candidates = siblings.filter((item) => item.status === 'DELIVERED' && item.requiresReturn);
    if (candidates.length === 0) {
      throw new ConflictException('Não há entregas aguardando retorno neste pedido.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of candidates) {
        await tx.delivery.update({
          where: { id: item.id },
          data: { status: 'COMPLETED', statusChangedAt: new Date() },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: item.id,
            fromStatus: 'DELIVERED',
            toStatus: 'COMPLETED',
            changedByUserId: user.id,
            note:
              `Retorno validado a ${Math.round(distanceMeters)}m do ponto de coleta ` +
              `(raio configurado: ${settings.returnProximityRadiusMeters}m).`,
          },
        });
      }
    });

    return {
      batchId: delivery.batchId,
      deliveries: await Promise.all(candidates.map((item) => this.detail(user, item.id))),
    };
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
    if (user.type === 'DRIVER') {
      const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
      if (!driver || driver.id !== delivery.driverId) {
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

  private async findDriverForUser(user: User) {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }
    const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }
    return driver;
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
    batchId: string | null;
    serviceType: { name: string };
    status: DeliveryStatus;
    destinationKnownAtCreation: boolean;
    distanceKm: { toString(): string } | null;
    totalValue: { toString(): string } | null;
    driverValue: { toString(): string } | null;
    platformValue: { toString(): string } | null;
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
      batchId: delivery.batchId,
      serviceTypeName: delivery.serviceType.name,
      status: delivery.status,
      destinationKnownAtCreation: delivery.destinationKnownAtCreation,
      distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
      totalValue: delivery.totalValue === null ? null : Number(delivery.totalValue),
      driverValue: delivery.driverValue === null ? null : Number(delivery.driverValue),
      platformValue: delivery.platformValue === null ? null : Number(delivery.platformValue),
      requiresReturn: delivery.requiresReturn,
      returnValue: delivery.returnValue === null ? null : Number(delivery.returnValue),
      scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    };
  }
}
