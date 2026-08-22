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
  DeliveryOperationsQuery,
  DeliveryStageTimesQuery,
  MarkDeliveredPayload,
  MarkFailedPayload,
  SearchDeliveriesQuery,
} from '@motoboycity/validation';
import type {
  DeliveryOperationsResult,
  DeliveryStageTimesResult,
  DeliverySearchResult,
  OperationalDeliveryItem,
  OperationalActivityType,
} from '@motoboycity/types';
import { Prisma } from '@prisma/client';
import type { Delivery, DeliveryStatus, User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { haversineDistanceMeters } from '../common/haversine';
import { DispatchService } from '../dispatch/dispatch.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { PricingService } from '../pricing/pricing.service';
import { GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { computeStageTimes } from './delivery-stage-times';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';
import { deliveryStatusEventLabel } from '../common/status-labels';
import { checkBusinessHours } from './business-hours';

const COMPANY_CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];
const ACTIVE_OPERATION_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  // Ativa: o motoboy esta na rua devolvendo a mercadoria e o pedido ainda vai
  // fechar. Fora daqui, a empresa perderia de vista justamente a entrega que
  // deu problema.
  'FAILED',
  'AWAITING_PAYMENT',
];
const RECENT_OPERATION_STATUSES: DeliveryStatus[] = ['COMPLETED', 'CANCELLED'];
const OPERATIONAL_DELIVERY_INCLUDE = Prisma.validator<Prisma.DeliveryInclude>()({
  company: true,
  serviceType: true,
  addresses: true,
  driver: { include: { user: { select: { name: true, phone: true } } } },
  trackingPoints: { orderBy: { capturedAt: 'desc' }, take: 1 },
});
type OperationalDeliveryRow = Prisma.DeliveryGetPayload<{
  include: typeof OPERATIONAL_DELIVERY_INCLUDE;
}>;

/**
 * Erro maximo aceito no fix que DEFINE o destino de uma entrega sem endereco.
 *
 * Nao e configuracao de negocio, e por isso e constante e nao campo de PlatformSettings:
 * e um piso tecnico de qualidade do dado. Deixar ajustavel pelo painel convidaria alguem
 * a subir para 5 km no dia em que o GPS estiver ruim — e o efeito seria cobrar preco de
 * uma rota inventada, sem ninguem perceber.
 *
 * 100 m e a mesma ordem de grandeza usada em produtos parecidos para separar "GPS travado"
 * de "triangulacao de antena". O retorno tem regra propria: a precisao e comparada com o
 * raio configurado, porque ali o que importa e a checagem nao virar ruido.
 */
const MAX_LOCATION_ACCURACY_METERS = 100;

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
  serviceTypeId: string;
  serviceTypeName: string;
  status: DeliveryStatus;
  destinationKnownAtCreation: boolean;
  distanceKm: number | null;
  totalValue: number | null;
  driverValue: number | null;
  platformValue: number | null;
  requiresReturn: boolean;
  returnValue: number | null;
  paymentMethod: 'BILLED' | 'ONLINE';
  recipientName: string | null;
  recipientPhone: string | null;
  externalOrderNumber: string | null;
  driverNote: string | null;
  customerPaymentMethod: 'PREPAID' | 'CARD' | 'CASH' | 'PIX' | null;
  surchargeLabel: string | null;
  surchargeValue: number | null;
  statusChangedAt: string;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  addresses: DeliveryAddressItem[];
  driver: { id: string; name: string; email: string; phone: string } | null;
  invoice: {
    id: string;
    number: string;
    status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  } | null;
  statusHistory: Array<{
    fromStatus: DeliveryStatus | null;
    toStatus: DeliveryStatus;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
    note: string | null;
  }>;
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
    private readonly financeLedgerService: FinanceLedgerService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
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

    await this.assertWithinBusinessHours(company.regionId, payload.scheduledAt);

    const destinationKnownAtCreation = payload.destinationKnownAtCreation ?? true;

    let distanceKm: number | null = null;
    let totalValue: number | null = null;
    let driverValue: number | null = null;
    let platformValue: number | null = null;
    let returnValue: number | null = null;
    // Nome e valor da taxa adicional vigente, congelados junto com o preco.
    let surchargeLabel: string | null = null;
    let surchargeValue: number | null = null;

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
        regionId: company.regionId,
        serviceTypeId: payload.serviceTypeId,
        distanceKm,
        requiresReturn: payload.requiresReturn ?? false,
      });
      totalValue = quote.totalValue;
      driverValue = quote.driverValue;
      platformValue = quote.platformValue;
      returnValue = quote.returnValue > 0 ? quote.returnValue : null;
      surchargeLabel = quote.surchargeLabel;
      surchargeValue = quote.surchargeValue > 0 ? quote.surchargeValue : null;
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
          surchargeLabel,
          surchargeValue,
          paymentMethod: 'BILLED',
          recipientName: payload.recipientName,
          recipientPhone: payload.recipientPhone,
          externalOrderNumber: payload.externalOrderNumber,
          driverNote: payload.driverNote,
          customerPaymentMethod: payload.customerPaymentMethod,
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
          lat: dropoffAddress.lat,
          lng: dropoffAddress.lng,
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

    const detail = await this.detail(user, created.id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_CREATED');
    return detail;
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

    // O lote inteiro compartilha o mesmo agendamento, validado em Zod, entao
    // basta olhar o primeiro item.
    await this.assertWithinBusinessHours(company.regionId, payload.deliveries[0]?.scheduledAt);

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
          regionId: company.regionId,
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
            recipientName: item.recipientName,
            recipientPhone: item.recipientPhone,
            externalOrderNumber: item.externalOrderNumber,
            driverNote: item.driverNote,
            customerPaymentMethod: item.customerPaymentMethod,
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
            lat: dropoffAddress.lat,
            lng: dropoffAddress.lng,
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
    const details = await Promise.all(created.map((delivery) => this.detail(user, delivery.id)));
    details.forEach((detail) => this.publishDeliveryUpdate(detail, 'DELIVERY_CREATED'));
    return {
      batchId,
      deliveries: details,
    };
  }

  async list(
    user: User,
    filters: {
      status?: DeliveryStatus;
      driverId?: string;
      companyId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<DeliveryListItem[]> {
    if ((filters.driverId || filters.companyId) && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Os filtros por entregador ou empresa sao restritos a administradores.',
      );
    }

    const scope = await this.resolveListScope(user);

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        ...scope,
        ...(filters.status && { status: filters.status }),
        ...(filters.driverId && { driverId: filters.driverId }),
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from && { gte: this.startOfDay(filters.from) }),
                ...(filters.to && { lte: this.endOfDay(filters.to) }),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { company: true, serviceType: true },
    });

    return deliveries.map((delivery) => this.toListItem(delivery));
  }

  async operations(
    user: User,
    filters: DeliveryOperationsQuery,
  ): Promise<DeliveryOperationsResult> {
    if (user.type === 'DRIVER') {
      throw new ForbiddenException(
        'A central operacional é restrita a empresas e administradores.',
      );
    }
    if ((filters.companyId || filters.driverId) && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Os filtros por entregador ou empresa são restritos a administradores.',
      );
    }

    const scope = await this.resolveListScope(user);
    const baseWhere = this.buildDeliveryWhere(scope, filters);
    const requestedStatuses = filters.statuses?.length ? filters.statuses : null;
    const activeStatuses = requestedStatuses
      ? ACTIVE_OPERATION_STATUSES.filter((status) => requestedStatuses.includes(status))
      : ACTIVE_OPERATION_STATUSES;
    const recentStatuses = requestedStatuses
      ? RECENT_OPERATION_STATUSES.filter((status) => requestedStatuses.includes(status))
      : RECENT_OPERATION_STATUSES;
    const [active, recent] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where: { ...baseWhere, status: { in: activeStatuses } },
        orderBy: { statusChangedAt: 'asc' },
        include: OPERATIONAL_DELIVERY_INCLUDE,
      }),
      this.prisma.delivery.findMany({
        where: { ...baseWhere, status: { in: recentStatuses } },
        orderBy: { statusChangedAt: 'desc' },
        take: 20,
        include: OPERATIONAL_DELIVERY_INCLUDE,
      }),
    ]);
    const statuses = await this.prisma.delivery.findMany({
      where: baseWhere,
      select: { status: true },
    });
    const counts = statuses.reduce<Record<string, number>>((result, delivery) => {
      result[delivery.status] = (result[delivery.status] ?? 0) + 1;
      return result;
    }, {});

    return {
      active: active.map((delivery) => this.toOperationalItem(delivery)),
      recent: recent.map((delivery) => this.toOperationalItem(delivery)),
      counts,
    };
  }

  async search(user: User, filters: SearchDeliveriesQuery): Promise<DeliverySearchResult> {
    if ((filters.driverId || filters.companyId) && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Os filtros por entregador ou empresa são restritos a administradores.',
      );
    }
    const scope = await this.resolveListScope(user);
    const where = this.buildDeliveryWhere(scope, filters);
    const [total, deliveries] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: { company: true, serviceType: true },
      }),
    ]);

    return {
      items: deliveries.map((delivery) => this.toListItem(delivery)),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
    };
  }

  async group(user: User, id: string): Promise<DeliveryGroupResult> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('Pedido não encontrado.');
    await this.assertCanAccess(user, delivery);
    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: delivery.batchId },
          orderBy: { displayNumber: 'asc' },
        })
      : [delivery];
    return {
      batchId: delivery.batchId,
      deliveries: await Promise.all(siblings.map((item) => this.detail(user, item.id))),
    };
  }

  async detail(user: User, id: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        company: true,
        serviceType: true,
        addresses: true,
        driver: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
        },
        invoice: { select: { id: true, number: true, status: true } },
        statusHistory: {
          include: { changedByUser: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
      },
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
      driver: delivery.driver
        ? {
            id: delivery.driver.id,
            name: delivery.driver.user.name,
            email: delivery.driver.user.email,
            phone: delivery.driver.user.phone,
          }
        : null,
      invoice: delivery.invoice
        ? {
            id: delivery.invoice.id,
            number: delivery.invoice.number,
            status: delivery.invoice.status,
          }
        : null,
      statusHistory: delivery.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedAt: entry.changedAt.toISOString(),
        changedBy: entry.changedByUser
          ? { id: entry.changedByUser.id, name: entry.changedByUser.name }
          : null,
        note: entry.note,
      })),
    };
  }

  /**
   * Reenvia um pedido parado aos motoboys.
   *
   * A varredura automatica so roda quando um motoboy fica disponivel — nao ha
   * temporizador. Entao um pedido cuja oferta expirou e para o qual nenhum
   * motoboy novo entrou desde entao fica parado sem oferta pendente, e nada o
   * move. Este endpoint e a forma de a loja destravar isso sem cancelar e
   * recriar, que perderia o numero do pedido e a hora de criacao.
   *
   * `dispatchDelivery` ja e seguro de repetir: nao faz nada se ja existe oferta
   * pendente, se o pedido saiu de AWAITING_DRIVER, ou se nao ha motoboy
   * elegivel. Entao apertar duas vezes nao duplica oferta.
   */
  async redispatch(user: User, id: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    await this.assertCanAccess(user, delivery);

    if (delivery.status !== 'AWAITING_DRIVER') {
      throw new ConflictException(
        'Só é possível chamar novamente enquanto o pedido está buscando motoboy.',
      );
    }

    await this.dispatchService.dispatchDelivery(id);
    return this.detail(user, id);
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

    // Empresa nao pode cancelar depois do aceite. Quando o admin encerra uma
    // entrega operacional, o motoboy precisa sair da tela imediatamente em vez
    // de descobrir so no proximo toque que nao pode mais avancar o pedido.
    const cancelledIdsByDriver = new Map<string, string[]>();
    for (const item of cancellable) {
      if (!item.driverId) continue;
      const ids = cancelledIdsByDriver.get(item.driverId) ?? [];
      ids.push(item.id);
      cancelledIdsByDriver.set(item.driverId, ids);
    }
    for (const [driverId, deliveryIds] of cancelledIdsByDriver) {
      this.realtimeGateway.emitToDriver(driverId, 'delivery:cancelled', { deliveryIds });
    }

    for (const item of cancellable) {
      this.realtimeGateway.emitDeliveryUpdated(item.companyId, {
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        batchId: item.batchId,
        status: 'CANCELLED',
      });
      this.realtimeGateway.emitAdminActivity({
        type: 'DELIVERY_CANCELLED',
        message: `Pedido #${item.displayNumber}: CANCELLED.`,
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        status: 'CANCELLED',
      });
    }
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

    const details = await Promise.all(siblings.map((item) => this.detail(user, item.id)));
    details.forEach((detail) => this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED'));
    return {
      batchId: delivery.batchId,
      deliveries: details,
    };
  }

  /** Uma entrega por vez — cada item do lote é concluído em local/momento
   * diferente. Quando destinationKnownAtCreation=false, lat/lng do corpo
   * viram o destino: distância e preço são calculados agora, não na criação.
   * Fecha sozinho (COMPLETED) se não exigir retorno; senão fica em
   * DELIVERED até completeReturn(). */
  /**
   * Insucesso de entrega: o motoboy chegou mas nao conseguiu entregar.
   *
   * Nao e cancelamento. A regra de negocio confirmada e que a mercadoria volta
   * para a loja e a empresa paga a corrida normal — entao o pedido NAO fecha
   * aqui: ele vai para FAILED e so fecha quando o motoboy confirmar o retorno
   * perto da loja, pelo mesmo `completeReturn` de uma entrega bem-sucedida com
   * retorno. Isso faz o repasse sair pelo caminho ja existente, com o
   * `driverValue` congelado na criacao — ou seja, a corrida normal.
   *
   * Nao ha desconto nem cobranca extra: o valor ja congelado e o que vale.
   */
  async markFailed(user: User, id: string, payload: MarkFailedPayload): Promise<DeliveryDetail> {
    const driver = await this.findDriverForUser(user);
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });

    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }
    // Antes da coleta nao existe mercadoria em posse do motoboy, entao nao ha
    // o que devolver — desistir ali e outro problema (recusa/cancelamento),
    // nao insucesso de entrega.
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException('Só é possível registrar insucesso depois de coletar o pedido.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id },
        data: {
          status: 'FAILED',
          statusChangedAt: new Date(),
          failedAt: new Date(),
          failureReason: payload.reason,
          failureNote: payload.note ?? null,
        },
      });
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: id,
          fromStatus: 'COLLECTED',
          toStatus: 'FAILED',
          changedByUserId: user.id,
          note: this.describeFailure(payload),
        },
      });
    });

    this.realtimeGateway.emitAdminActivity({
      type: 'DELIVERY_STATUS_CHANGED',
      message: `Pedido #${delivery.displayNumber} sem sucesso na entrega — retornando à loja.`,
      deliveryId: id,
    });

    return this.detail(user, id);
  }

  private describeFailure(payload: MarkFailedPayload): string {
    const labels: Record<MarkFailedPayload['reason'], string> = {
      RECIPIENT_ABSENT: 'Destinatário ausente',
      ADDRESS_NOT_FOUND: 'Endereço não encontrado',
      RECIPIENT_REFUSED: 'Destinatário recusou',
      OTHER: 'Outro motivo',
    };
    const where = `registrado a ${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`;
    const note = payload.note ? ` — ${payload.note}` : '';
    return `${labels[payload.reason]} (${where})${note}`;
  }

  async markDelivered(
    user: User,
    id: string,
    payload: MarkDeliveredPayload,
  ): Promise<DeliveryDetail> {
    const driver = await this.findDriverForUser(user);
    // `company` entra junto porque a cotação por GPS acontece aqui, e o preço depende da
    // praça da EMPRESA — não de quem está entregando nem da primeira região do banco.
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { company: { select: { regionId: true } } },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('Este pedido não está atribuído a este motoboy.');
    }
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException(
        'O pedido precisa estar coletado antes de ser marcado como entregue.',
      );
    }

    let distanceKm = delivery.distanceKm === null ? null : Number(delivery.distanceKm);
    let totalValue = delivery.totalValue === null ? null : Number(delivery.totalValue);
    let driverValue = delivery.driverValue === null ? null : Number(delivery.driverValue);
    let platformValue = delivery.platformValue === null ? null : Number(delivery.platformValue);
    let returnValue = delivery.returnValue === null ? null : Number(delivery.returnValue);
    // Parte do congelamento: a entrega sem destino conhecido so ganha preco —
    // e taxa — quando o motoboy confirma a entrega e a distancia existe.
    let surchargeLabel = delivery.surchargeLabel;
    let surchargeValue = delivery.surchargeValue === null ? null : Number(delivery.surchargeValue);
    let capturedLat: number | null = null;
    let capturedLng: number | null = null;

    if (!delivery.destinationKnownAtCreation) {
      if (payload.lat === undefined || payload.lng === undefined) {
        throw new ConflictException(
          'É necessário informar a localização atual para concluir esta entrega.',
        );
      }
      // Aqui a coordenada vira destino, distância e preço — dinheiro cobrado da empresa e
      // pago ao motoboy. Um fix impreciso nao "erra um pouco": ele grava um destino que
      // nunca existiu e um valor que ninguem consegue contestar depois, porque o pedido
      // fecha COMPLETED com esse numero.
      if (payload.accuracy !== undefined && payload.accuracy > MAX_LOCATION_ACCURACY_METERS) {
        throw new ConflictException(
          `A precisão do GPS agora (${Math.round(payload.accuracy)}m) é baixa demais para definir ` +
            `o destino desta entrega. Aguarde o sinal melhorar e tente de novo.`,
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
        regionId: delivery.company.regionId,
        serviceTypeId: delivery.serviceTypeId,
        distanceKm: distance.distanceKm,
        requiresReturn: delivery.requiresReturn,
      });

      distanceKm = distance.distanceKm;
      totalValue = quote.totalValue;
      driverValue = quote.driverValue;
      platformValue = quote.platformValue;
      returnValue = quote.returnValue > 0 ? quote.returnValue : null;
      surchargeLabel = quote.surchargeLabel;
      surchargeValue = quote.surchargeValue > 0 ? quote.surchargeValue : null;
      capturedLat = payload.lat;
      capturedLng = payload.lng;
    }

    const autoComplete = !delivery.requiresReturn;

    try {
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
            surchargeLabel,
            surchargeValue,
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
          await this.financeLedgerService.creditDriverRepasse(tx, {
            id: delivery.id,
            driverId: delivery.driverId,
            driverValue,
          });
        }
      });
    } catch (error) {
      if (this.isRepasseIdempotencyConflict(error)) {
        throw new ConflictException(
          'Esta entrega já foi concluída em outra solicitação. Atualize a tela.',
        );
      }
      throw error;
    }

    const detail = await this.detail(user, delivery.id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  /** Fecha os itens do lote que exigem retorno e já foram entregues —
   * só quando o motoboy está fisicamente perto do endereço de coleta da
   * empresa (checagem por distância em linha reta, não rota real). */
  async completeReturn(
    user: User,
    id: string,
    payload: CompleteReturnPayload,
  ): Promise<DeliveryGroupResult> {
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
      throw new ConflictException(
        'O endereço de coleta da empresa não tem coordenadas cadastradas.',
      );
    }

    // Precisao maior que o proprio raio torna a checagem vazia: com raio de 200 m e um
    // fix de 800 m, "voltei na loja" fica verdadeiro em qualquer lugar do bairro. Recusar
    // e melhor que aprovar por ruido — o motoboy tenta de novo com o GPS estabilizado.
    if (payload.accuracy !== undefined && payload.accuracy > settings.returnProximityRadiusMeters) {
      throw new ConflictException(
        `A precisao do GPS agora (${Math.round(payload.accuracy)}m) e maior que o raio aceito ` +
          `(${settings.returnProximityRadiusMeters}m). Aguarde o sinal melhorar e tente de novo.`,
      );
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
    // FAILED entra sem olhar `requiresReturn`: a mercadoria precisa voltar
    // para a loja de qualquer forma, tenha ou nao sido pedido retorno.
    const candidates = siblings.filter(
      (item) => (item.status === 'DELIVERED' && item.requiresReturn) || item.status === 'FAILED',
    );
    if (candidates.length === 0) {
      throw new ConflictException('Não há entregas aguardando retorno neste pedido.');
    }
    if (candidates.some((item) => !item.driverId || item.driverValue === null)) {
      throw new InternalServerErrorException(
        'Não foi possível gerar o repasse: há uma entrega de retorno sem entregador ou valor definido.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of candidates) {
          await tx.delivery.update({
            where: { id: item.id },
            data: { status: 'COMPLETED', statusChangedAt: new Date() },
          });
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: item.id,
              fromStatus: item.status,
              toStatus: 'COMPLETED',
              changedByUserId: user.id,
              note:
                `Retorno validado a ${Math.round(distanceMeters)}m do ponto de coleta ` +
                `(raio configurado: ${settings.returnProximityRadiusMeters}m).`,
            },
          });
          await this.financeLedgerService.creditDriverRepasse(tx, {
            id: item.id,
            driverId: item.driverId,
            driverValue: item.driverValue,
          });
        }
      });
    } catch (error) {
      if (this.isRepasseIdempotencyConflict(error)) {
        throw new ConflictException(
          'Este retorno já foi concluído em outra solicitação. Atualize a tela.',
        );
      }
      throw error;
    }

    const details = await Promise.all(candidates.map((item) => this.detail(user, item.id)));
    details.forEach((detail) => this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED'));
    return {
      batchId: delivery.batchId,
      deliveries: details,
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

  /**
   * Publico porque as intervencoes manuais do admin vivem em outro modulo e
   * precisam avisar as telas do mesmo jeito. Duplicar a publicacao la deixaria
   * dois caminhos para o mesmo evento, e um deles envelheceria.
   */
  publishDeliveryUpdate(delivery: DeliveryDetail, type: OperationalActivityType): void {
    this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, delivery);
    this.realtimeGateway.emitAdminActivity({
      type,
      message: `Pedido #${delivery.displayNumber} ${deliveryStatusEventLabel[delivery.status]}.`,
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      companyName: delivery.companyName,
      status: delivery.status,
      ...(delivery.driver
        ? { driverId: delivery.driver.id, driverName: delivery.driver.name }
        : {}),
    });
  }

  private isRepasseIdempotencyConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  /**
   * Tempo por etapa do ciclo, no mesmo recorte da listagem.
   *
   * Deriva tudo do `DeliveryStatusHistory`, que ja grava cada transicao — nao
   * exige coluna nova nem migration. Cancelados ficam de fora: uma entrega
   * cancelada nao tem etapa concluida para medir, e incluí-la sujaria a media
   * com meio-caminho.
   */
  async stageTimes(
    user: User,
    filters: DeliveryStageTimesQuery,
  ): Promise<DeliveryStageTimesResult> {
    if ((filters.driverId || filters.companyId) && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Os filtros por entregador ou empresa sao restritos a administradores.',
      );
    }

    const scope = await this.resolveListScope(user);

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        ...scope,
        ...(filters.driverId && { driverId: filters.driverId }),
        ...(filters.companyId && { companyId: filters.companyId }),
        status: { not: 'CANCELLED' },
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from && { gte: this.startOfDay(filters.from) }),
                ...(filters.to && { lte: this.endOfDay(filters.to) }),
              },
            }
          : {}),
      },
      select: {
        statusHistory: {
          select: { fromStatus: true, toStatus: true, changedAt: true },
        },
      },
    });

    return computeStageTimes(deliveries.map((delivery) => delivery.statusHistory));
  }

  private async resolveListScope(user: User): Promise<{ companyId?: string; driverId?: string }> {
    if (user.type === 'ADMIN') {
      return {};
    }
    if (user.type === 'COMPANY_MEMBER') {
      const company = await this.findCompanyForUser(user);
      if (!company) {
        throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
      }
      return { companyId: company.id };
    }
    if (user.type === 'DRIVER') {
      const driver = await this.findDriverForUser(user);
      return { driverId: driver.id };
    }
    throw new ForbiddenException('Acesso restrito a empresas, entregadores e administradores.');
  }

  private async findCompanyForUser(
    user: User,
  ): Promise<{ id: string; status: string; regionId: string } | null> {
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
    // regionId acompanha a empresa porque o preço depende da praça dela — ver o
    // comentário de `PricingQuoteInput.regionId`.
    return {
      id: membership.company.id,
      status: membership.company.status,
      regionId: membership.company.regionId,
    };
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

  /**
   * O filtro por data e lido no relogio da operacao, nao em UTC.
   *
   * Com as pontas em `T00:00:00Z`/`T23:59:59Z`, o registro das 22h de terca
   * caia no recorte de quarta: tres horas de todo dia lancadas no dia errado.
   * Quem digita 22/08 no painel quer o dia 22 em Lajinha.
   */
  private startOfDay(date: string): Date {
    return startOfDayInSaoPaulo(date);
  }

  private buildDeliveryWhere(
    scope: { companyId?: string; driverId?: string },
    filters: {
      q?: string;
      status?: DeliveryStatus;
      statuses?: DeliveryStatus[];
      companyId?: string;
      driverId?: string;
      from?: string;
      to?: string;
    },
  ): Prisma.DeliveryWhereInput {
    const query = filters.q?.trim();
    const parsedDisplayNumber = query && /^\d+$/.test(query) ? Number(query) : null;
    const isUuid = Boolean(
      query &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query),
    );
    const queryFilter: Prisma.DeliveryWhereInput = query
      ? {
          OR: [
            { externalOrderNumber: { contains: query, mode: 'insensitive' } },
            ...(parsedDisplayNumber === null ? [] : [{ displayNumber: parsedDisplayNumber }]),
            ...(isUuid ? [{ id: query }] : []),
          ],
        }
      : {};

    return {
      ...scope,
      ...(filters.status && { status: filters.status }),
      ...(filters.statuses?.length && { status: { in: filters.statuses } }),
      ...(filters.driverId && { driverId: filters.driverId }),
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from && { gte: this.startOfDay(filters.from) }),
              ...(filters.to && { lte: this.endOfDay(filters.to) }),
            },
          }
        : {}),
      ...queryFilter,
    };
  }

  private toOperationalItem(delivery: OperationalDeliveryRow): OperationalDeliveryItem {
    const point = delivery.trackingPoints[0];
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
      driver: delivery.driver
        ? {
            id: delivery.driver.id,
            name: delivery.driver.user.name,
            phone: delivery.driver.user.phone,
          }
        : null,
      lastLocation: point
        ? {
            id: point.id,
            lat: Number(point.lat),
            lng: Number(point.lng),
            accuracy: point.accuracy === null ? null : Number(point.accuracy),
            capturedAt: point.capturedAt.toISOString(),
          }
        : null,
    };
  }

  private endOfDay(date: string): Date {
    return endOfDayInSaoPaulo(date);
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
    serviceType: { id: string; name: string };
    status: DeliveryStatus;
    destinationKnownAtCreation: boolean;
    distanceKm: { toString(): string } | null;
    totalValue: { toString(): string } | null;
    driverValue: { toString(): string } | null;
    platformValue: { toString(): string } | null;
    requiresReturn: boolean;
    returnValue: { toString(): string } | null;
    paymentMethod: 'BILLED' | 'ONLINE';
    recipientName: string | null;
    recipientPhone: string | null;
    externalOrderNumber: string | null;
    driverNote: string | null;
    customerPaymentMethod: 'PREPAID' | 'CARD' | 'CASH' | 'PIX' | null;
    statusChangedAt: Date;
    surchargeLabel: string | null;
    surchargeValue: { toString(): string } | null;
    scheduledAt: Date | null;
    createdAt: Date;
  }): DeliveryListItem {
    return {
      id: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      companyName: delivery.company.tradeName,
      batchId: delivery.batchId,
      // O id acompanha o nome porque clonar um pedido precisa reselecionar a
      // modalidade, e casar por nome quebraria numa renomeacao.
      surchargeLabel: delivery.surchargeLabel,
      surchargeValue: delivery.surchargeValue === null ? null : Number(delivery.surchargeValue),
      serviceTypeId: delivery.serviceType.id,
      serviceTypeName: delivery.serviceType.name,
      status: delivery.status,
      destinationKnownAtCreation: delivery.destinationKnownAtCreation,
      distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
      totalValue: delivery.totalValue === null ? null : Number(delivery.totalValue),
      driverValue: delivery.driverValue === null ? null : Number(delivery.driverValue),
      platformValue: delivery.platformValue === null ? null : Number(delivery.platformValue),
      requiresReturn: delivery.requiresReturn,
      returnValue: delivery.returnValue === null ? null : Number(delivery.returnValue),
      paymentMethod: delivery.paymentMethod,
      recipientName: delivery.recipientName,
      recipientPhone: delivery.recipientPhone,
      externalOrderNumber: delivery.externalOrderNumber,
      driverNote: delivery.driverNote,
      customerPaymentMethod: delivery.customerPaymentMethod,
      statusChangedAt: delivery.statusChangedAt.toISOString(),
      scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    };
  }

  /**
   * Recusa o pedido fora do horário de funcionamento.
   *
   * O instante avaliado é o do AGENDAMENTO quando existe, e não o de agora: um
   * pedido marcado para amanhã às 10h precisa ser aceito hoje à noite, senão a
   * loja não conseguiria programar nada fora do expediente — que é justamente
   * quando ela tem tempo de programar.
   *
   * Sem horário configurado, ou com o bloqueio desligado, passa direto. Uma
   * operação que nunca mexeu nisso não pode acordar recusando pedidos.
   */
  private async assertWithinBusinessHours(regionId: string, scheduledAt?: string): Promise<void> {
    const settings = await this.platformSettingsService.get();
    if (!settings.businessHoursEnabled) return;

    const windows = await this.prisma.businessHour.findMany({ where: { regionId } });
    if (windows.length === 0) return;

    const at = scheduledAt ? new Date(scheduledAt) : new Date();
    const { open, nextOpeningLabel } = checkBusinessHours(windows, at);
    if (open) return;

    /**
     * A mensagem diz quando abre. Uma recusa que informa só "estamos fechados"
     * deixa a loja adivinhando; com o horário, o erro vira instrução.
     */
    const quando = scheduledAt ? 'O horário agendado está' : 'A operação está';
    throw new ConflictException(
      nextOpeningLabel
        ? `${quando} fora do horário de funcionamento. Abre ${nextOpeningLabel}.`
        : `${quando} fora do horário de funcionamento.`,
    );
  }
}
