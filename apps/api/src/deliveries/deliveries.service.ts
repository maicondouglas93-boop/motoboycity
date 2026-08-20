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
import { Prisma } from '@prisma/client';
import type { Delivery, DeliveryStatus, User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { haversineDistanceMeters } from '../common/haversine';
import { DispatchService } from '../dispatch/dispatch.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { PricingService } from '../pricing/pricing.service';
import { GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const COMPANY_CANCELLABLE_STATUSES: DeliveryStatus[] = ['SCHEDULED', 'AWAITING_DRIVER'];

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
        regionId: company.regionId,
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

    return this.detail(user, delivery.id);
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
    const candidates = siblings.filter(
      (item) => item.status === 'DELIVERED' && item.requiresReturn,
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
              fromStatus: 'DELIVERED',
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

  private isRepasseIdempotencyConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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

  private startOfDay(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private endOfDay(date: string): Date {
    return new Date(`${date}T23:59:59.999Z`);
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
    paymentMethod: 'BILLED' | 'ONLINE';
    statusChangedAt: Date;
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
      paymentMethod: delivery.paymentMethod,
      statusChangedAt: delivery.statusChangedAt.toISOString(),
      scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    };
  }
}
