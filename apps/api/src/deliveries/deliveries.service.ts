import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CompleteReturnPayload,
  CreateDeliveryBatchPayload,
  AdminMarkFailedPayload,
  CreateDeliveryPayload,
  DeliveryOperationsQuery,
  DeliveryStageTimesQuery,
  DeliverySummaryQuery,
  MarkDeliveredPayload,
  MarkCollectedPayload,
  MarkFailedPayload,
  ReturnToQueuePayload,
  SearchDeliveriesQuery,
} from '@motoboycity/validation';
import { companyCustomerPhoneSchema } from '@motoboycity/validation';
import type {
  DeliveryOperationsResult,
  DeliveryStageTimesResult,
  DeliverySearchResult,
  DeliverySummaryResult,
  OperationalDeliveryItem,
  OperationalActivityType,
} from '@motoboycity/types';
import { Prisma } from '@prisma/client';
import type { Delivery, DeliveryStatus, User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { haversineDistanceMeters } from '../common/haversine';
import { DispatchService } from '../dispatch/dispatch.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { ReturnNotSupportedError } from '../pricing/pricing-calculator';
import { PricingService, type PricingQuoteInput } from '../pricing/pricing.service';
import {
  GoogleMapsApiError,
  GoogleMapsNotConfiguredError,
  type ReverseGeocodedAddress,
} from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { StageTimesAccumulator } from './delivery-stage-times';
import {
  checkRetroactiveMarking,
  describeDeclaredTime,
  describeRetroactiveProblem,
} from './retroactive-marking';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { endOfDayInSaoPaulo, startOfDayInSaoPaulo } from '../common/sao-paulo-time';
import { deliveryActivityMessage } from '../common/status-labels';
import { checkBusinessHours } from './business-hours';
import { IntegrationOutboxRecorder } from '../integrations/integration-outbox-recorder.service';

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
const POST_COLLECTION_STATUSES: DeliveryStatus[] = [
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'COMPLETED',
];

/**
 * Ajusta somente a janela de estados terminais retornada pela central que
 * consome `operations`. O endpoint da empresa continua usando o padrao acima;
 * o admin pode aplicar uma janela mais curta sem duplicar a consulta inteira.
 */
export interface DeliveryOperationsRecentWindow {
  statuses: DeliveryStatus[];
  changedSince?: Date;
  /** `null` remove o limite por quantidade; `undefined` preserva o padrao 20. */
  limit?: number | null;
}

interface IntegrationCreationMetadata {
  integrationId: string;
  externalOrderId: string;
  historyNote: string;
}

const OPERATIONAL_DELIVERY_INCLUDE = Prisma.validator<Prisma.DeliveryInclude>()({
  company: true,
  serviceType: true,
  addresses: true,
  driver: { include: { user: { select: { name: true, phone: true, avatarUrl: true } } } },
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
 * de "triangulacao de antena". Ele vale somente quando a coordenada define o destino e o preco.
 */
const MAX_LOCATION_ACCURACY_METERS = 100;

/**
 * Recusa o fix impreciso demais para VIRAR o destino.
 *
 * O limite e mais rigido que os raios de proximidade de proposito, e a mensagem
 * diz isso: os raios respondem "ele esta perto do endereco que ja conhecemos?",
 * e aqui nao ha endereco conhecido para comparar — a posicao vira o endereco e o
 * preco. Sem essa frase, o motoboy le "800m e demais" com um raio de 5000m
 * configurado na tela e conclui, com razao, que o sistema se contradiz.
 */
function assertAccuracyForCapturedDestination(
  accuracy: number | undefined,
  limitMeters: number,
): void {
  if (accuracy === undefined || accuracy <= limitMeters) return;
  throw new ConflictException(
    `A precisão do GPS agora (${Math.round(accuracy)}m) é baixa demais para definir o destino ` +
      `desta entrega, que exige ${limitMeters}m ou melhor. O limite é mais rígido que o raio ` +
      `porque a sua posição vira o endereço e o valor da corrida. Aguarde o sinal melhorar e ` +
      `tente de novo.`,
  );
}

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
  requiresDeliveryProof: boolean;
  requiresCollectionRecipient: boolean;
  pickupSurchargeChargedToDriver: boolean;
  surchargeLabel: string | null;
  surchargeValue: number | null;
  statusChangedAt: string;
  pickupDeadlineAt: string | null;
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

interface DeferredDestinationPricing {
  distanceKm: number;
  totalValue: number;
  driverValue: number;
  platformValue: number;
  returnValue: number | null;
  surchargeLabel: string | null;
  surchargeValue: number | null;
  lat: number;
  lng: number;
}

interface FailureReturnPricing {
  totalValue: number;
  driverValue: number;
  platformValue: number;
  returnValue: number | null;
}

interface ProximityPayload {
  lat?: number;
  lng?: number;
  accuracy?: number;
}

/**
 * Resultado da conferencia de proximidade de uma etapa.
 *
 * `SEM_COORDENADAS` existe porque criar e concluir tinham exigencias
 * diferentes sobre o mesmo dado: a criacao aceita um endereco que o Google nao
 * encontrou e segue com o texto, e a conclusao recusava esse mesmo pedido para
 * sempre. Quem pagava por isso era o motoboy parado na porta do cliente, sem
 * nada que ele pudesse fazer — aumentar o raio nao resolvia, porque a recusa
 * acontecia antes de qualquer conta de distancia.
 *
 * Agora a etapa passa, mas passa MARCADA: o historico registra que nao houve
 * validacao e por que, e o painel recebe o aviso para alguem corrigir o
 * cadastro. A trava continua valendo inteira onde ha coordenada.
 */
type ProximityOutcome =
  | { kind: 'DESLIGADA' }
  | { kind: 'VALIDADA'; distanceMeters: number; targetLabel: string }
  | { kind: 'SEM_COORDENADAS'; targetLabel: string };

export interface AdminDeliverySearchSummary {
  total: number;
  items: Array<{
    id: string;
    displayNumber: number;
    companyName: string;
    serviceTypeName: string;
    status: DeliveryStatus;
    distanceKm: number | null;
    totalValue: number | null;
    driverName: string | null;
    statusChangedAt: string;
    createdAt: string;
  }>;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly googleMapsService: GoogleMapsService,
    private readonly dispatchService: DispatchService,
    private readonly financeLedgerService: FinanceLedgerService,
    private readonly platformSettingsService: AdminPlatformSettingsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly integrationOutbox: IntegrationOutboxRecorder,
  ) {}

  async create(user: User, payload: CreateDeliveryPayload): Promise<DeliveryDetail> {
    const company = await this.findCompanyForUser(user);
    if (!company) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    if (company.status !== 'ACTIVE') {
      throw new ForbiddenException('Sua empresa precisa estar aprovada para lançar pedidos.');
    }

    return this.createForResolvedCompany(user, company, payload);
  }

  /**
   * Cria um pedido em nome de uma empresa escolhida pelo administrador.
   * A empresa selecionada continua sendo a dona operacional e financeira; o
   * administrador fica registrado como autor no historico.
   */
  async createForCompany(
    admin: User,
    companyId: string,
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryDetail> {
    if (admin.type !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, status: true, regionId: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    if (company.status !== 'ACTIVE') {
      throw new ForbiddenException('A empresa precisa estar ativa para lançar pedidos.');
    }

    return this.createForResolvedCompany(admin, company, payload);
  }

  /**
   * Entrada interna para conectores. Reaproveita exatamente o mesmo calculo
   * de rota, preco, retorno e agendamento dos pedidos manuais, mas deixa o
   * autor humano nulo no historico e grava a identidade externa atomica.
   */
  async createFromIntegration(
    companyId: string,
    integrationId: string,
    externalOrderId: string,
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryDetail> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, status: true, regionId: true },
    });
    if (!company || company.status !== 'ACTIVE') {
      throw new ConflictException('A empresa da integracao nao esta ativa.');
    }

    const owner = await this.prisma.companyTeamMember.findFirst({
      where: { companyId, role: 'OWNER', active: true },
      orderBy: { joinedAt: 'asc' },
      select: { user: true },
    });
    if (!owner) {
      throw new ConflictException('A empresa da integracao nao possui responsavel ativo.');
    }

    return this.createForResolvedCompany(
      owner.user,
      company,
      {
        ...payload,
        idempotencyKey: this.deterministicUuid(
          `integration:${integrationId}:order:${externalOrderId}`,
        ),
      },
      {
        integrationId,
        externalOrderId,
        historyNote: 'Pedido importado automaticamente do aiqfome.',
      },
    );
  }

  /**
   * Edita um pedido avulso antes de ele ser aceito por um motoboy.
   *
   * O painel pode alterar inclusive modalidade e destino, portanto preço e
   * distância são recalculados e congelados novamente. Uma oferta pendente
   * bloqueia a edição: o motoboy precisa decidir sobre exatamente os dados
   * que viu no celular.
   */
  async updateBeforeAcceptance(
    admin: User,
    deliveryId: string,
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryDetail> {
    if (admin.type !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        company: { select: { id: true, status: true, regionId: true } },
        addresses: true,
        offers: { where: { response: 'PENDING' }, select: { id: true }, take: 1 },
      },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (delivery.batchId) {
      throw new ConflictException(
        'Pedidos em lote não podem ser editados individualmente. Cancele e recrie o lote.',
      );
    }
    if (delivery.status !== 'SCHEDULED' && delivery.status !== 'AWAITING_DRIVER') {
      throw new ConflictException(
        'O pedido só pode ser editado antes de ser aceito por um entregador.',
      );
    }
    if (delivery.offers.length > 0) {
      throw new ConflictException(
        'Existe uma oferta aguardando resposta. Aguarde a resposta ou o vencimento para editar.',
      );
    }
    if (delivery.company.status !== 'ACTIVE') {
      throw new ConflictException('A empresa deste pedido não está ativa.');
    }

    await this.assertWithinBusinessHours(delivery.company.regionId, payload.scheduledAt);
    const destinationKnownAtCreation = payload.destinationKnownAtCreation ?? true;
    const pickupAddress = delivery.addresses.find((address) => address.type === 'PICKUP');
    if (
      !pickupAddress?.street ||
      !pickupAddress.number ||
      !pickupAddress.city ||
      !pickupAddress.state ||
      !pickupAddress.zip
    ) {
      throw new ConflictException('O pedido não possui um endereço de coleta válido.');
    }

    let distanceKm: number | null = null;
    let totalValue: number | null = null;
    let driverValue: number | null = null;
    let platformValue: number | null = null;
    let returnValue: number | null = null;
    let surchargeLabel: string | null = null;
    let surchargeValue: number | null = null;

    if (destinationKnownAtCreation) {
      try {
        const distance = await this.googleMapsService.getDistance({
          origin: {
            address: this.formatAddress({
              street: pickupAddress.street,
              number: pickupAddress.number,
              complement: pickupAddress.complement,
              city: pickupAddress.city,
              state: pickupAddress.state,
              zip: pickupAddress.zip,
            }),
          },
          destination: { address: this.formatAddress(payload.dropoffAddress!) },
        });
        distanceKm = distance.distanceKm;
      } catch (error) {
        if (error instanceof GoogleMapsNotConfiguredError) {
          throw new InternalServerErrorException(
            'Cálculo de distância não está configurado. Contate o suporte.',
          );
        }
        throw new ServiceUnavailableException(
          'Não foi possível recalcular a distância agora. Tente novamente em instantes.',
        );
      }

      const quote = await this.pricingService.quote({
        companyId: delivery.company.id,
        regionId: delivery.company.regionId,
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

    const nextStatus: DeliveryStatus = payload.scheduledAt ? 'SCHEDULED' : 'AWAITING_DRIVER';
    if (nextStatus === 'AWAITING_DRIVER') {
      await this.dispatchService.assertConfigured();
    }
    const dropoffCoordinate = destinationKnownAtCreation
      ? await this.resolverCoordenadaDoDestino(payload.dropoffAddress!)
      : { lat: null, lng: null };
    const companyCustomerId = await this.resolveCompanyCustomerId(
      delivery.company.id,
      payload.recipientPhone,
    );

    const changedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          status: delivery.status,
          offers: { none: { response: 'PENDING' } },
        },
        data: {
          serviceTypeId: payload.serviceTypeId,
          status: nextStatus,
          ...(nextStatus !== delivery.status && { statusChangedAt: changedAt }),
          scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
          destinationKnownAtCreation,
          distanceKm,
          totalValue,
          driverValue,
          platformValue,
          surchargeLabel,
          surchargeValue,
          recipientName: payload.recipientName ?? null,
          recipientPhone: payload.recipientPhone ?? null,
          companyCustomerId,
          externalOrderNumber: payload.externalOrderNumber ?? null,
          driverNote: payload.driverNote ?? null,
          customerPaymentMethod: payload.customerPaymentMethod ?? null,
          requiresDeliveryProof: payload.requiresDeliveryProof ?? false,
          requiresCollectionRecipient: payload.requiresCollectionRecipient ?? false,
          pickupSurchargeChargedToDriver: payload.pickupSurchargeChargedToDriver ?? false,
          requiresReturn: payload.requiresReturn ?? false,
          returnValue,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'O pedido mudou ou recebeu uma oferta durante a edicao. Atualize a tela e tente novamente.',
        );
      }
      await tx.deliveryAddress.deleteMany({
        where: { deliveryId: delivery.id, type: 'DROPOFF' },
      });
      if (destinationKnownAtCreation) {
        const dropoff = payload.dropoffAddress!;
        await tx.deliveryAddress.create({
          data: {
            deliveryId: delivery.id,
            type: 'DROPOFF',
            street: dropoff.street,
            number: dropoff.number,
            complement: dropoff.complement,
            city: dropoff.city,
            state: dropoff.state,
            zip: dropoff.zip,
            referenceNote: dropoff.referenceNote,
            lat: dropoffCoordinate.lat,
            lng: dropoffCoordinate.lng,
          },
        });
      }
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: delivery.status,
          toStatus: nextStatus,
          changedByUserId: admin.id,
          note: 'Dados, rota e preço revisados pelo administrador antes do aceite.',
        },
      });
    });

    if (delivery.status === 'SCHEDULED') {
      await this.dispatchService.cancelScheduledActivation(delivery.id);
    } else {
      await this.dispatchService.cancelPendingOfferForDelivery(delivery.id);
    }

    if (nextStatus === 'SCHEDULED') {
      await this.dispatchService.scheduleActivation(delivery.id, new Date(payload.scheduledAt!));
    } else {
      await this.dispatchService.dispatchDelivery(delivery.id);
    }

    const detail = await this.detail(admin, delivery.id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  private async createForResolvedCompany(
    user: User,
    company: { id: string; status: string; regionId: string },
    payload: CreateDeliveryPayload,
    integration?: IntegrationCreationMetadata,
  ): Promise<DeliveryDetail> {
    const idempotentDeliveryId = payload.idempotencyKey
      ? this.deterministicUuid(`delivery:${company.id}:${payload.idempotencyKey}`)
      : null;
    if (idempotentDeliveryId) {
      const existing = await this.resumeSingleCreation(user, company.id, idempotentDeliveryId);
      if (existing) {
        return existing;
      }
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
        companyId: company.id,
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

    /**
     * Fora da transacao de proposito: geocodificar e chamada de rede, e segurar
     * uma transacao aberta esperando o Google prenderia conexao do banco.
     */
    const coordenadaDoDestino = destinationKnownAtCreation
      ? await this.resolverCoordenadaDoDestino(payload.dropoffAddress!)
      : { lat: null, lng: null };
    const companyCustomerId = await this.resolveCompanyCustomerId(
      company.id,
      payload.recipientPhone,
    );

    let created: Delivery;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.delivery.create({
          data: {
            ...(idempotentDeliveryId && { id: idempotentDeliveryId }),
            companyId: company.id,
            companyCustomerId,
            ...(integration && {
              integrationId: integration.integrationId,
              externalOrderId: integration.externalOrderId,
            }),
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
            lat: coordenadaDoDestino.lat,
            lng: coordenadaDoDestino.lng,
          });
        }
        await tx.deliveryAddress.createMany({ data: addresses });

        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: delivery.id,
            fromStatus: null,
            toStatus: initialStatus,
            changedByUserId: integration ? null : user.id,
            note: integration?.historyNote,
          },
        });

        return delivery;
      });
    } catch (error) {
      if (idempotentDeliveryId && this.isUniqueConstraintError(error)) {
        const existing = await this.resumeSingleCreation(user, company.id, idempotentDeliveryId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }

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

    const batchId = payload.idempotencyKey
      ? this.deterministicUuid(`delivery-batch:${company.id}:${payload.idempotencyKey}`)
      : randomUUID();
    const idempotentDeliveryIds = payload.idempotencyKey
      ? payload.deliveries.map((_, index) =>
          this.deterministicUuid(`delivery-batch-item:${batchId}:${index}`),
        )
      : null;
    if (idempotentDeliveryIds) {
      const existing = await this.resumeBatchCreation(
        user,
        company.id,
        batchId,
        idempotentDeliveryIds,
      );
      if (existing) {
        return existing;
      }
    }

    const pickupAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId: company.id, isPrimary: true },
    });
    if (!pickupAddress) {
      throw new ConflictException('A empresa ainda não tem um endereço de coleta cadastrado.');
    }

    await this.assertBatchSizeAllowed(payload.deliveries.length);

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
          companyId: company.id,
          regionId: company.regionId,
          serviceTypeId: item.serviceTypeId,
          distanceKm,
          requiresReturn: item.requiresReturn ?? false,
        });
        return { item, destinationKnownAtCreation, distanceKm, quote };
      }),
    );

    /**
     * Uma geocodificacao por item do lote, todas antes da transacao. Em
     * paralelo porque sao independentes e o lote pode ter dezenas de itens —
     * em serie o lancamento ficaria visivelmente lento para a loja.
     */
    const coordenadasDosDestinos = await Promise.all(
      prepared.map(({ item, destinationKnownAtCreation }) =>
        destinationKnownAtCreation
          ? this.resolverCoordenadaDoDestino(item.dropoffAddress!)
          : Promise.resolve({ lat: null, lng: null }),
      ),
    );
    const companyCustomerIdsByPhone = await this.resolveCompanyCustomerIds(
      company.id,
      payload.deliveries.map((item) => item.recipientPhone),
    );

    let created: Delivery[];
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const deliveries = [];
        for (const [
          indice,
          { item, destinationKnownAtCreation, distanceKm, quote },
        ] of prepared.entries()) {
          const delivery = await tx.delivery.create({
            data: {
              ...(idempotentDeliveryIds?.[indice] && { id: idempotentDeliveryIds[indice] }),
              companyId: company.id,
              companyCustomerId: this.customerIdFromPhone(
                item.recipientPhone,
                companyCustomerIdsByPhone,
              ),
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
            const coordenada = coordenadasDosDestinos[indice] ?? { lat: null, lng: null };
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
              lat: coordenada.lat,
              lng: coordenada.lng,
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
    } catch (error) {
      if (idempotentDeliveryIds && this.isUniqueConstraintError(error)) {
        const existing = await this.resumeBatchCreation(
          user,
          company.id,
          batchId,
          idempotentDeliveryIds,
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }

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
    recentWindow?: DeliveryOperationsRecentWindow,
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
    const availableRecentStatuses = recentWindow?.statuses ?? RECENT_OPERATION_STATUSES;
    const recentStatuses = requestedStatuses
      ? availableRecentStatuses.filter((status) => requestedStatuses.includes(status))
      : availableRecentStatuses;
    const recentLimit =
      recentWindow?.limit === undefined
        ? filters.batchId || filters.deliveryId
          ? null
          : 20
        : recentWindow.limit;
    const [active, recent] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where: { ...baseWhere, status: { in: activeStatuses } },
        orderBy: { statusChangedAt: 'asc' },
        include: OPERATIONAL_DELIVERY_INCLUDE,
      }),
      this.prisma.delivery.findMany({
        where: {
          ...baseWhere,
          status: { in: recentStatuses },
          ...(recentWindow?.changedSince
            ? { statusChangedAt: { gte: recentWindow.changedSince } }
            : {}),
        },
        orderBy: { statusChangedAt: 'desc' },
        ...(recentLimit === null ? {} : { take: recentLimit }),
        include: OPERATIONAL_DELIVERY_INCLUDE,
      }),
    ]);
    const statusGroups = await this.prisma.delivery.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all]),
    );

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

  async summary(user: User, filters: DeliverySummaryQuery): Promise<DeliverySummaryResult> {
    if ((filters.driverId || filters.companyId) && user.type !== 'ADMIN') {
      throw new ForbiddenException(
        'Os filtros por entregador ou empresa sao restritos a administradores.',
      );
    }

    const scope = await this.resolveListScope(user);
    const where = this.buildDeliveryWhere(scope, filters);
    const [statusGroups, totals, completedTotals] = await this.prisma.$transaction([
      this.prisma.delivery.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.delivery.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.delivery.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: {
          totalValue: true,
          driverValue: true,
          platformValue: true,
        },
      }),
    ]);
    const counts: Partial<Record<DeliveryStatus, number>> = {};
    statusGroups.forEach((group) => {
      counts[group.status] =
        typeof group._count === 'object' && group._count !== null ? (group._count._all ?? 0) : 0;
    });

    return {
      totalCount: totals._count._all,
      counts,
      totalValue: Number(totals._sum.totalValue ?? 0),
      completedTotalValue: Number(completedTotals._sum.totalValue ?? 0),
      completedDriverValue: Number(completedTotals._sum.driverValue ?? 0),
      completedPlatformValue: Number(completedTotals._sum.platformValue ?? 0),
    };
  }

  /**
   * Busca administrativa enxuta para integrações internas. Não seleciona
   * destinatário, telefone, observações nem endereços.
   */
  async searchAdminSummary(
    user: User,
    filters: SearchDeliveriesQuery,
  ): Promise<AdminDeliverySearchSummary> {
    if (user.type !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    const scope = await this.resolveListScope(user);
    const where = this.buildDeliveryWhere(scope, filters);
    const [total, deliveries] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.pageSize,
        select: {
          id: true,
          displayNumber: true,
          status: true,
          distanceKm: true,
          totalValue: true,
          statusChangedAt: true,
          createdAt: true,
          company: { select: { tradeName: true } },
          serviceType: { select: { name: true } },
          driver: { select: { user: { select: { name: true } } } },
        },
      }),
    ]);

    return {
      total,
      items: deliveries.map((delivery) => ({
        id: delivery.id,
        displayNumber: delivery.displayNumber,
        companyName: delivery.company.tradeName,
        serviceTypeName: delivery.serviceType.name,
        status: delivery.status,
        distanceKm: delivery.distanceKm === null ? null : Number(delivery.distanceKm),
        totalValue: delivery.totalValue === null ? null : Number(delivery.totalValue),
        driverName: delivery.driver?.user.name ?? null,
        statusChangedAt: delivery.statusChangedAt.toISOString(),
        createdAt: delivery.createdAt.toISOString(),
      })),
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

    let resolvedGpsAddress: {
      addressId: string;
      value: ReverseGeocodedAddress;
    } | null = null;

    // Pedidos com destino definido somente na entrega guardam a coordenada
    // capturada pelo app. Ao abrir o detalhe no Admin ou na empresa dona,
    // enriquecemos registros novos e antigos com rua/cidade sem colocar o
    // Google no caminho critico do motoboy. Qualquer falha mantem a coordenada
    // visivel e nao altera o status, os valores ou a conclusao do pedido.
    if (user.type === 'ADMIN' || user.type === 'COMPANY_MEMBER') {
      const gpsDropoff = delivery.addresses.find(
        (address) =>
          address.type === 'DROPOFF' &&
          !address.street?.trim() &&
          address.lat !== null &&
          address.lng !== null,
      );

      if (gpsDropoff) {
        try {
          const value = await this.googleMapsService.reverseGeocode({
            lat: Number(gpsDropoff.lat),
            lng: Number(gpsDropoff.lng),
          });
          if (value) {
            await this.prisma.deliveryAddress.updateMany({
              where: { id: gpsDropoff.id, street: null },
              data: {
                street: value.street,
                number: value.number,
                city: value.city,
                state: value.state,
                zip: value.zip,
              },
            });
            resolvedGpsAddress = { addressId: gpsDropoff.id, value };
          }
        } catch (error) {
          this.logger.warn(
            `Falha ao identificar o endereco final da entrega ${id}: ${String(error)}`,
          );
        }
      }
    }

    return {
      ...this.toListItem(delivery),
      addresses: delivery.addresses.map((address) => {
        const resolved =
          resolvedGpsAddress && resolvedGpsAddress.addressId === address.id
            ? resolvedGpsAddress.value
            : null;
        return {
          type: address.type,
          street: resolved?.street ?? address.street,
          number: resolved?.number ?? address.number,
          complement: address.complement,
          city: resolved?.city ?? address.city,
          state: resolved?.state ?? address.state,
          zip: resolved?.zip ?? address.zip,
          lat: address.lat === null ? null : Number(address.lat),
          lng: address.lng === null ? null : Number(address.lng),
          referenceNote: address.referenceNote,
        };
      }),
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

  /**
   * `reason` vira a nota do historico. Opcional porque a loja cancela pelo
   * aplicativo em segundos; o painel do admin pede, porque quem cancela
   * entrega dos outros precisa deixar dito por que.
   */
  async cancel(user: User, id: string, reason?: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        company: { select: { tradeName: true } },
        driver: { include: { user: { select: { name: true } } } },
      },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    await this.assertCanAccess(user, delivery);

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({
          where: { batchId: delivery.batchId },
          include: {
            company: { select: { tradeName: true } },
            driver: { include: { user: { select: { name: true } } } },
          },
        })
      : [delivery];

    /**
     * Itens já CANCELLED/COMPLETED ficam de fora — sem isto, um item que já
     * fechou sozinho (ex.: entrega sem retorno) travaria o cancelamento dos
     * demais itens do lote, ainda ativos, pra sempre.
     *
     * IRMAO ja entregue tambem fica de fora, e por outro motivo. Cancelar em
     * `DELIVERED`/`FAILED` continua permitido quando e ESTE o pedido que a
     * pessoa mandou cancelar — a regra de negocio diz que admin e motoboy
     * cancelam em qualquer etapa ativa. O que nao pode e o efeito colateral:
     * cancelar o item 2 de um lote arrastava junto o item 1, que ja tinha sido
     * entregue, apagando do historico uma corrida que aconteceu e o repasse que
     * ela ia gerar. Quem ja foi para a rua fecha pelo retorno, e ninguem pediu
     * para cancelar aquele.
     */
    const jaFoiParaRua: DeliveryStatus[] = ['DELIVERED', 'FAILED'];
    const cancellable = siblings.filter((item) => {
      if (item.status === 'CANCELLED' || item.status === 'COMPLETED') return false;
      if (item.id !== delivery.id && jaFoiParaRua.includes(item.status)) return false;
      return true;
    });
    if (cancellable.length === 0) {
      throw new ConflictException('Este pedido já está cancelado ou concluído.');
    }
    for (const item of cancellable) {
      if (user.type === 'COMPANY_MEMBER' && !COMPANY_CANCELLABLE_STATUSES.includes(item.status)) {
        throw new ConflictException(
          'A empresa só pode cancelar o lote enquanto nenhum entregador tiver aceitado.',
        );
      }
      if (user.type === 'DRIVER' && item.driverId !== delivery.driverId) {
        throw new ForbiddenException('O lote possui uma entrega atribuída a outro motoboy.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of cancellable) {
        const updated = await tx.delivery.updateMany({
          where: { id: item.id, status: item.status },
          data: { status: 'CANCELLED', statusChangedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'O pedido mudou enquanto era cancelado. Atualize a tela e tente novamente.',
          );
        }
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: item.id,
            fromStatus: item.status,
            toStatus: 'CANCELLED',
            changedByUserId: user.id,
            note: reason?.trim() || null,
          },
        });
        await this.integrationOutbox.record(tx, item.id, 'CANCELLED');
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
        message: deliveryActivityMessage({
          displayNumber: item.displayNumber,
          companyName: item.company?.tradeName,
          status: 'CANCELLED',
          driverName: item.driver?.user.name,
        }),
        deliveryId: item.id,
        displayNumber: item.displayNumber,
        companyId: item.companyId,
        ...(item.company?.tradeName ? { companyName: item.company.tradeName } : {}),
        ...(item.driver ? { driverId: item.driver.id, driverName: item.driver.user.name } : {}),
        status: 'CANCELLED',
      });
    }
    return this.detail(user, id);
  }

  async cancelFromIntegration(
    integrationId: string,
    externalOrderId: string,
    reason?: string,
  ): Promise<'CANCELLED' | 'NOT_FOUND' | 'TERMINAL' | 'REVIEW'> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { integrationId_externalOrderId: { integrationId, externalOrderId } },
      include: {
        company: { select: { tradeName: true } },
        driver: { include: { user: { select: { name: true } } } },
      },
    });
    if (!delivery) return 'NOT_FOUND';
    if (delivery.status === 'CANCELLED' || delivery.status === 'COMPLETED') return 'TERMINAL';
    if (!COMPANY_CANCELLABLE_STATUSES.includes(delivery.status)) return 'REVIEW';

    const changedAt = new Date();
    const changed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.updateMany({
        where: { id: delivery.id, status: delivery.status },
        data: { status: 'CANCELLED', statusChangedAt: changedAt },
      });
      if (updated.count !== 1) return false;
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: delivery.status,
          toStatus: 'CANCELLED',
          changedByUserId: null,
          note: reason?.trim().slice(0, 500) || 'Cancelado no aiqfome.',
        },
      });
      return true;
    });
    if (!changed) return 'REVIEW';

    if (delivery.status === 'SCHEDULED') {
      await this.dispatchService.cancelScheduledActivation(delivery.id);
    } else {
      await this.dispatchService.cancelPendingOfferForDelivery(delivery.id);
    }
    this.realtimeGateway.emitDeliveryUpdated(delivery.companyId, {
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      batchId: delivery.batchId,
      status: 'CANCELLED',
    });
    this.realtimeGateway.emitAdminActivity({
      type: 'DELIVERY_CANCELLED',
      message: deliveryActivityMessage({
        displayNumber: delivery.displayNumber,
        companyName: delivery.company.tradeName,
        status: 'CANCELLED',
        driverName: delivery.driver?.user.name,
      }),
      deliveryId: delivery.id,
      displayNumber: delivery.displayNumber,
      companyId: delivery.companyId,
      companyName: delivery.company.tradeName,
      status: 'CANCELLED',
    });
    return 'CANCELLED';
  }

  /** Ação única pro lote inteiro — "cheguei na empresa, peguei tudo".
   * Exige que todos os itens estejam ACCEPTED: divergência de status entre
   * itens do mesmo lote só começa a existir depois de coletado. */
  async collect(
    user: User,
    id: string,
    payload?: MarkCollectedPayload,
  ): Promise<DeliveryGroupResult> {
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
    if (siblings.every((item) => POST_COLLECTION_STATUSES.includes(item.status))) {
      return this.deliveryGroupResult(
        user,
        delivery.batchId,
        siblings.map((item) => item.id),
      );
    }
    if (siblings.some((item) => item.status !== 'ACCEPTED')) {
      throw new ConflictException('Todos os itens do pedido precisam estar aceitos para coletar.');
    }

    const settings = await this.platformSettingsService.get();
    const collectionProximity = await this.assertNearCompanyAddress(
      delivery.companyId,
      settings.collectionProximityRadiusMeters,
      payload ?? {},
      'marcar a coleta',
    );
    const occurredAt = this.resolveRetroactiveAt(
      payload?.occurredAt,
      // O piso e o aceite mais recente do lote: um item aceito depois nao pode
      // ter coleta declarada antes de existir motoboy nele.
      new Date(Math.max(...siblings.map((item) => item.statusChangedAt.getTime()))),
      settings.minMinutesBeforeCollect,
    );
    const agora = new Date();
    const collectionHistoryNote = [
      occurredAt
        ? `Coleta marcada depois — declarada para ${describeDeclaredTime(occurredAt)}.`
        : null,
      this.proximityHistoryNote(
        collectionProximity,
        settings.collectionProximityRadiusMeters,
        payload ?? {},
        'Coleta',
        'validada',
      ),
    ]
      .filter((note): note is string => note !== null)
      .join(' ');
    this.avisarProximidadeNaoValidada(collectionProximity, delivery.displayNumber, 'coleta');

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of siblings) {
          const updated = await tx.delivery.updateMany({
            where: { id: item.id, status: 'ACCEPTED', driverId: driver.id },
            /**
             * Na marcacao retroativa o carimbo do estado passa a ser o horario
             * DECLARADO, e nao o do toque. Ele e o relogio operacional — e o que
             * a fila ao vivo mostra, e o piso da proxima declaracao — enquanto a
             * prova do registro fica no `changedAt` do historico.
             */
            data: { status: 'COLLECTED', statusChangedAt: occurredAt ?? agora },
          });
          if (updated.count !== 1) {
            throw new ConflictException('A coleta já foi registrada por outra solicitação.');
          }
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: item.id,
              fromStatus: 'ACCEPTED',
              toStatus: 'COLLECTED',
              changedByUserId: user.id,
              ...(occurredAt && { occurredAt }),
              ...(collectionHistoryNote && { note: collectionHistoryNote }),
            },
          });
          await this.integrationOutbox.record(tx, item.id, 'COLLECTED');
        }
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const collected = await this.collectResultIfApplied(user, id, driver.id);
        if (collected) return collected;
      }
      throw error;
    }

    const details = await Promise.all(siblings.map((item) => this.detail(user, item.id)));
    details.forEach((detail) => this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED'));
    return {
      batchId: delivery.batchId,
      deliveries: details,
    };
  }

  private async collectResultIfApplied(
    user: User,
    id: string,
    driverId: string,
  ): Promise<DeliveryGroupResult | null> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.driverId !== driverId) return null;
    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];
    if (!siblings.every((item) => POST_COLLECTION_STATUSES.includes(item.status))) return null;
    return this.deliveryGroupResult(
      user,
      delivery.batchId,
      siblings.map((item) => item.id),
    );
  }

  private async deliveryGroupResult(
    user: User,
    batchId: string | null,
    deliveryIds: string[],
  ): Promise<DeliveryGroupResult> {
    return {
      batchId,
      deliveries: await Promise.all(deliveryIds.map((deliveryId) => this.detail(user, deliveryId))),
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
   * aqui: ele vai para FAILED e so fecha quando o motoboy confirmar o retorno,
   * pelo mesmo `completeReturn` de uma entrega bem-sucedida com retorno. Isso
   * faz o repasse sair pelo caminho ja existente. A corrida normal continua
   * congelada e a taxa de retorno vigente e acrescentada integralmente ao
   * total e ao repasse do motoboy, sem comissao da plataforma. Quando o destino
   * seria definido pelo GPS, a posicao da tentativa de entrega congela agora
   * distancia, cobranca e repasse ja incluindo o retorno.
   *
   * Pedido que ja nasceu com retorno nao recebe a taxa novamente.
   */
  private async quoteRequiredReturn(input: Omit<PricingQuoteInput, 'requiresReturn'>) {
    try {
      return await this.pricingService.quote({ ...input, requiresReturn: true });
    } catch (error) {
      if (error instanceof ReturnNotSupportedError) {
        throw new ConflictException(
          'O valor de retorno não está configurado para esta empresa e modalidade. Contate o suporte.',
        );
      }
      throw error;
    }
  }

  private async calculateFailureReturnPricing(
    delivery: Pick<
      Delivery,
      'companyId' | 'serviceTypeId' | 'distanceKm' | 'totalValue' | 'driverValue' | 'platformValue'
    > & { company: { regionId: string } },
    failedAt: Date,
  ): Promise<FailureReturnPricing> {
    if (
      delivery.distanceKm === null ||
      delivery.totalValue === null ||
      delivery.driverValue === null ||
      delivery.platformValue === null
    ) {
      throw new InternalServerErrorException(
        'Não foi possível calcular o retorno: o pedido está sem os valores originais.',
      );
    }

    const quote = await this.quoteRequiredReturn({
      companyId: delivery.companyId,
      regionId: delivery.company.regionId,
      serviceTypeId: delivery.serviceTypeId,
      distanceKm: Number(delivery.distanceKm),
      at: failedAt,
    });

    const totalValueCents = Math.round(Number(delivery.totalValue) * 100);
    const driverValueCents = Math.round(Number(delivery.driverValue) * 100);
    const platformValueCents = Math.round(Number(delivery.platformValue) * 100);
    const returnValueCents = Math.round(quote.returnValue * 100);
    const moneyValues = [totalValueCents, driverValueCents, platformValueCents, returnValueCents];

    if (moneyValues.some((value) => !Number.isSafeInteger(value)) || returnValueCents < 0) {
      throw new InternalServerErrorException(
        'Não foi possível calcular o retorno: a tabela de preços retornou um valor inválido.',
      );
    }
    if (driverValueCents + platformValueCents !== totalValueCents) {
      throw new InternalServerErrorException(
        'Não foi possível calcular o retorno: os valores originais do pedido estão inconsistentes.',
      );
    }

    return {
      totalValue: (totalValueCents + returnValueCents) / 100,
      driverValue: (driverValueCents + returnValueCents) / 100,
      platformValue: platformValueCents / 100,
      returnValue: returnValueCents > 0 ? returnValueCents / 100 : null,
    };
  }

  private async calculateDeferredDestinationPricing(
    delivery: Pick<Delivery, 'companyId' | 'serviceTypeId'> & {
      company: { regionId: string };
    },
    payload: { lat?: number; lng?: number; accuracy?: number },
    failedAt: Date,
  ): Promise<DeferredDestinationPricing> {
    if (payload.lat === undefined || payload.lng === undefined) {
      throw new ConflictException(
        'É necessário informar a localização atual para registrar o destino e calcular o valor desta entrega.',
      );
    }
    const settings = await this.platformSettingsService.get();
    assertAccuracyForCapturedDestination(
      payload.accuracy,
      settings.deferredDestinationMaxAccuracyMeters ?? MAX_LOCATION_ACCURACY_METERS,
    );

    const pickupAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId: delivery.companyId, isPrimary: true },
    });
    if (!pickupAddress) {
      throw new ConflictException('A empresa não tem mais um endereço de coleta cadastrado.');
    }

    let distance: { distanceKm: number };
    try {
      distance = await this.getDistanceToCapturedDestination(
        this.formatAddress(pickupAddress),
        payload.lat,
        payload.lng,
        pickupAddress.lat !== null && pickupAddress.lng !== null
          ? { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) }
          : undefined,
      );
    } catch (error) {
      if (error instanceof GoogleMapsNotConfiguredError) {
        throw new InternalServerErrorException(
          'Cálculo de distância não está configurado. Contate o suporte.',
        );
      }
      if (this.isNoRouteError(error)) {
        throw new UnprocessableEntityException(
          'O Google não encontrou uma rota viária para este destino. O pedido precisa de revisão.',
        );
      }
      throw new ServiceUnavailableException(
        'Não foi possível calcular a distância desta entrega agora. Tente novamente em instantes.',
      );
    }

    const quote = await this.quoteRequiredReturn({
      companyId: delivery.companyId,
      regionId: delivery.company.regionId,
      serviceTypeId: delivery.serviceTypeId,
      distanceKm: distance.distanceKm,
      at: failedAt,
    });

    return {
      distanceKm: distance.distanceKm,
      totalValue: quote.totalValue,
      driverValue: quote.driverValue,
      platformValue: quote.platformValue,
      returnValue: quote.returnValue > 0 ? quote.returnValue : null,
      surchargeLabel: quote.surchargeLabel,
      surchargeValue: quote.surchargeValue > 0 ? quote.surchargeValue : null,
      lat: payload.lat,
      lng: payload.lng,
    };
  }

  async markFailed(user: User, id: string, payload: MarkFailedPayload): Promise<DeliveryDetail> {
    const driver = await this.findDriverForUser(user);
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
    if (
      (delivery.status === 'FAILED' || delivery.status === 'COMPLETED') &&
      delivery.failedAt !== null
    ) {
      return this.detail(user, id);
    }
    // Antes da coleta nao existe mercadoria em posse do motoboy, entao nao ha
    // o que devolver — desistir ali e outro problema (recusa/cancelamento),
    // nao insucesso de entrega.
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException('Só é possível registrar insucesso depois de coletar o pedido.');
    }

    const failedAt = new Date();
    const deferredPricing = delivery.destinationKnownAtCreation
      ? null
      : await this.calculateDeferredDestinationPricing(delivery, payload, failedAt);
    const failureReturnPricing =
      delivery.destinationKnownAtCreation && !delivery.requiresReturn
        ? await this.calculateFailureReturnPricing(delivery, failedAt)
        : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.updateMany({
          where: { id, status: 'COLLECTED', driverId: driver.id },
          data: {
            status: 'FAILED',
            statusChangedAt: failedAt,
            failedAt,
            failureReason: payload.reason,
            failureNote: payload.note ?? null,
            requiresReturn: true,
            ...(failureReturnPricing && {
              totalValue: failureReturnPricing.totalValue,
              driverValue: failureReturnPricing.driverValue,
              platformValue: failureReturnPricing.platformValue,
              returnValue: failureReturnPricing.returnValue,
            }),
            ...(deferredPricing && {
              distanceKm: deferredPricing.distanceKm,
              totalValue: deferredPricing.totalValue,
              driverValue: deferredPricing.driverValue,
              platformValue: deferredPricing.platformValue,
              returnValue: deferredPricing.returnValue,
              surchargeLabel: deferredPricing.surchargeLabel,
              surchargeValue: deferredPricing.surchargeValue,
            }),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('O insucesso já foi registrado por outra solicitação.');
        }
        if (deferredPricing) {
          await tx.deliveryAddress.create({
            data: {
              deliveryId: id,
              type: 'DROPOFF',
              street: null,
              number: null,
              complement: null,
              city: null,
              state: null,
              zip: null,
              lat: deferredPricing.lat,
              lng: deferredPricing.lng,
            },
          });
        }
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: id,
            fromStatus: 'COLLECTED',
            toStatus: 'FAILED',
            changedByUserId: user.id,
            note: this.describeFailure(payload),
          },
        });
        await this.integrationOutbox.record(tx, id, 'FAILED');
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const current = await this.prisma.delivery.findUnique({ where: { id } });
        if (
          current?.driverId === driver.id &&
          (current.status === 'FAILED' || current.status === 'COMPLETED') &&
          current.failedAt !== null
        ) {
          return this.detail(user, id);
        }
      }
      throw error;
    }

    const detail = await this.detail(user, id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  /**
   * Insucesso registrado pelo ADMINISTRADOR.
   *
   * Era o unico estado sem saida do ciclo. O insucesso do motoboy depende de
   * GPS e de uma rota do Google quando o pedido calcula o preco na entrega;
   * falhando qualquer um dos dois, ele ficava com a mercadoria na mao e o
   * pedido preso em COLLECTED — sem acao para ele nem para o painel.
   *
   * Espelha `markFailed` de proposito, inclusive na idempotencia e no
   * `requiresReturn` que o insucesso liga. As duas diferencas sao deliberadas:
   * a distancia vem do administrador em vez do GPS, e nao se cria endereco de
   * destino, porque nao houve coordenada capturada para registrar.
   */
  async markFailedByAdmin(
    admin: User,
    id: string,
    payload: AdminMarkFailedPayload,
  ): Promise<DeliveryDetail> {
    if (admin.type !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { company: { select: { regionId: true } } },
    });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (
      (delivery.status === 'FAILED' || delivery.status === 'COMPLETED') &&
      delivery.failedAt !== null
    ) {
      return this.detail(admin, id);
    }
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException('Só é possível registrar insucesso depois de coletar o pedido.');
    }
    if (!delivery.driverId) {
      throw new ConflictException('O pedido não está atribuído a nenhum entregador.');
    }

    const precoDiferido = !delivery.destinationKnownAtCreation && delivery.driverValue === null;
    if (precoDiferido && payload.distanceKm === undefined) {
      throw new ConflictException(
        'Este pedido calcula o valor pela localização da entrega, que não chegou. ' +
          'Informe a distância percorrida para registrar o insucesso pelo painel.',
      );
    }
    if (!precoDiferido && payload.distanceKm !== undefined) {
      throw new ConflictException(
        'Este pedido já tem valor calculado. A distância informada não seria usada.',
      );
    }

    const failedAt = new Date();
    /**
     * O preco sai das MESMAS rotinas do fluxo do motoboy. O administrador
     * informa a distancia; quanto a empresa paga e quanto o motoboy recebe
     * continua vindo da tabela vigente.
     */
    const precoInformado = precoDiferido
      ? await this.quoteRequiredReturn({
          companyId: delivery.companyId,
          regionId: delivery.company.regionId,
          serviceTypeId: delivery.serviceTypeId,
          distanceKm: payload.distanceKm as number,
          at: failedAt,
        })
      : null;
    const failureReturnPricing =
      delivery.destinationKnownAtCreation && !delivery.requiresReturn
        ? await this.calculateFailureReturnPricing(delivery, failedAt)
        : null;

    const nota =
      `Insucesso registrado manualmente pelo administrador. Motivo: ${payload.reason}` +
      (payload.note ? ` — ${payload.note}` : '') +
      (precoInformado ? ` Distância informada pelo administrador: ${payload.distanceKm} km.` : '');

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.updateMany({
          where: { id, status: 'COLLECTED', driverId: delivery.driverId },
          data: {
            status: 'FAILED',
            statusChangedAt: failedAt,
            failedAt,
            failureReason: payload.failureReason,
            failureNote: payload.note ?? null,
            requiresReturn: true,
            ...(failureReturnPricing && {
              totalValue: failureReturnPricing.totalValue,
              driverValue: failureReturnPricing.driverValue,
              platformValue: failureReturnPricing.platformValue,
              returnValue: failureReturnPricing.returnValue,
            }),
            ...(precoInformado && {
              distanceKm: payload.distanceKm,
              totalValue: precoInformado.totalValue,
              driverValue: precoInformado.driverValue,
              platformValue: precoInformado.platformValue,
              returnValue: precoInformado.returnValue > 0 ? precoInformado.returnValue : null,
              surchargeLabel: precoInformado.surchargeLabel,
              surchargeValue:
                precoInformado.surchargeValue > 0 ? precoInformado.surchargeValue : null,
            }),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('O insucesso já foi registrado por outra solicitação.');
        }
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: id,
            fromStatus: 'COLLECTED',
            toStatus: 'FAILED',
            changedByUserId: admin.id,
            note: nota,
          },
        });
        await this.integrationOutbox.record(tx, id, 'FAILED');
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const current = await this.prisma.delivery.findUnique({ where: { id } });
        if ((current?.status === 'FAILED' || current?.status === 'COMPLETED') && current.failedAt) {
          return this.detail(admin, id);
        }
      }
      throw error;
    }

    const detail = await this.detail(admin, id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  private describeFailure(payload: MarkFailedPayload): string {
    const labels: Record<MarkFailedPayload['reason'], string> = {
      RECIPIENT_ABSENT: 'Destinatário ausente',
      ADDRESS_NOT_FOUND: 'Endereço não encontrado',
      RECIPIENT_REFUSED: 'Destinatário recusou',
      OTHER: 'Outro motivo',
    };
    const where =
      payload.lat !== undefined && payload.lng !== undefined
        ? `registrado a ${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`
        : 'registrado pelo motoboy';
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
    if (
      (delivery.status === 'DELIVERED' || delivery.status === 'COMPLETED') &&
      delivery.failedAt === null
    ) {
      return this.detail(user, id);
    }
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException(
        'O pedido precisa estar coletado antes de ser marcado como entregue.',
      );
    }

    /**
     * Marcacao retroativa nao vale quando o GPS define o preco, e a recusa vem
     * ANTES de validar o horario de proposito: "nao da para marcar depois" e a
     * informacao util, e reclamar do horario primeiro mandaria a pessoa corrigir
     * um campo que nunca seria aceito.
     *
     * Nesta entrega e a coordenada DO MOMENTO que vira destino, distancia e
     * preco. Se o motoboy ja saiu de la, o fix que ele mandaria agora e de outro
     * lugar — o valor sairia de uma rota que nunca existiu. Declarar so o
     * horario tambem nao resolve: o preco continuaria vindo da posicao errada.
     * O caminho aqui e o admin, que tem `forceComplete` com motivo e trilha.
     */
    if (!delivery.destinationKnownAtCreation && payload.occurredAt !== undefined) {
      throw new ConflictException(
        'Esta entrega tem o valor calculado pela sua localização na hora da entrega, ' +
          'então não dá para marcá-la depois. Peça ao administrador para concluir o pedido.',
      );
    }

    const settings = await this.platformSettingsService.get();
    const occurredAt = this.resolveRetroactiveAt(
      payload.occurredAt,
      delivery.statusChangedAt,
      settings.minMinutesBeforeDeliver,
    );
    const deliveryProximity: ProximityOutcome = delivery.destinationKnownAtCreation
      ? await this.assertNearDeliveryAddress(
          delivery.id,
          settings.deliveryProximityRadiusMeters,
          payload,
        )
      : { kind: 'DESLIGADA' };
    let notaDeDistanciaZero: string | null = null;
    const deliveryHistoryNote = [
      occurredAt
        ? `Entrega marcada depois — declarada para ${describeDeclaredTime(occurredAt)}.`
        : null,
      this.proximityHistoryNote(
        deliveryProximity,
        settings.deliveryProximityRadiusMeters,
        payload,
        'Entrega',
        'validada',
      ),
    ]
      .filter((note): note is string => note !== null)
      .join(' ');
    this.avisarProximidadeNaoValidada(deliveryProximity, delivery.displayNumber, 'entrega');

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
      assertAccuracyForCapturedDestination(
        payload.accuracy,
        settings.deferredDestinationMaxAccuracyMeters ?? MAX_LOCATION_ACCURACY_METERS,
      );
      const pickupAddress = await this.prisma.companyAddress.findFirst({
        where: { companyId: delivery.companyId, isPrimary: true },
      });
      if (!pickupAddress) {
        throw new ConflictException('A empresa não tem mais um endereço de coleta cadastrado.');
      }

      let distance: { distanceKm: number };
      try {
        distance = await this.getDistanceToCapturedDestination(
          this.formatAddress(pickupAddress),
          payload.lat,
          payload.lng,
          pickupAddress.lat !== null && pickupAddress.lng !== null
            ? { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) }
            : undefined,
        );
      } catch (error) {
        const failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        this.logger.warn(
          `Pedido #${delivery.displayNumber}: falha ao calcular a distancia na conclusao (${failure}).`,
        );
        if (error instanceof GoogleMapsNotConfiguredError) {
          throw new InternalServerErrorException(
            'Cálculo de distância não está configurado. Contate o suporte.',
          );
        }
        if (this.isNoRouteError(error)) {
          throw new UnprocessableEntityException(
            'O Google não encontrou uma rota viária para este destino. O pedido precisa de revisão.',
          );
        }
        throw new ServiceUnavailableException(
          'Não foi possível calcular a distância desta entrega agora. Tente novamente em instantes.',
        );
      }

      const quoteInput = {
        companyId: delivery.companyId,
        regionId: delivery.company.regionId,
        serviceTypeId: delivery.serviceTypeId,
        distanceKm: distance.distanceKm,
      };
      const quote = delivery.requiresReturn
        ? await this.quoteRequiredReturn(quoteInput)
        : await this.pricingService.quote({ ...quoteInput, requiresReturn: false });

      /**
       * Entrega concluida a ZERO quilometro.
       *
       * E cobranca legitima — a tabela paga a taxa base — mas tambem e o
       * sintoma de um toque errado na porta da loja. Registrar aqui e o que
       * separa as duas: quem for conferir a fatura ve, escrito, que a corrida
       * fechou no mesmo ponto da coleta, em vez de descobrir um valor sem
       * explicacao.
       */
      if (distance.distanceKm === 0) {
        notaDeDistanciaZero =
          'Entrega concluída no mesmo ponto da coleta — distância calculada: 0 km. ' +
          'Cobrada pela taxa base da tabela.';
      }

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
        const updated = await tx.delivery.updateMany({
          where: { id: delivery.id, status: 'COLLECTED', driverId: driver.id },
          data: {
            status: autoComplete ? 'COMPLETED' : 'DELIVERED',
            statusChangedAt: occurredAt ?? new Date(),
            distanceKm,
            totalValue,
            driverValue,
            platformValue,
            surchargeLabel,
            surchargeValue,
            returnValue,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('A entrega já foi registrada por outra solicitação.');
        }

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

        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId: delivery.id,
            fromStatus: 'COLLECTED',
            toStatus: 'DELIVERED',
            changedByUserId: user.id,
            ...(occurredAt && { occurredAt }),
            ...(() => {
              const nota = [deliveryHistoryNote, notaDeDistanciaZero]
                .filter((parte): parte is string => Boolean(parte))
                .join(' ');
              return nota ? { note: nota } : {};
            })(),
          },
        });
        await this.integrationOutbox.record(tx, delivery.id, 'DELIVERED');

        if (autoComplete) {
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: delivery.id,
              fromStatus: 'DELIVERED',
              toStatus: 'COMPLETED',
              changedByUserId: user.id,
              // Fecha no mesmo instante da entrega, entao herda a declaracao:
              // sem isso o pedido teria entrega as 14h e conclusao as 15h.
              ...(occurredAt && { occurredAt }),
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
      if (error instanceof ConflictException || this.isRepasseIdempotencyConflict(error)) {
        const current = await this.prisma.delivery.findUnique({ where: { id } });
        if (
          current?.driverId === driver.id &&
          (current.status === 'DELIVERED' || current.status === 'COMPLETED') &&
          current.failedAt === null
        ) {
          return this.detail(user, id);
        }
      }
      throw error;
    }

    const detail = await this.detail(user, delivery.id);
    this.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  /** Fecha os itens do lote que exigem retorno e já foram entregues. */
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

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];
    // FAILED entra sem olhar `requiresReturn`: a mercadoria precisa voltar
    // para a loja de qualquer forma, tenha ou nao sido pedido retorno.
    const candidates = siblings.filter(
      (item) => (item.status === 'DELIVERED' && item.requiresReturn) || item.status === 'FAILED',
    );
    if (candidates.length === 0) {
      const completed = siblings.filter(
        (item) => item.status === 'COMPLETED' && (item.requiresReturn || item.failedAt !== null),
      );
      if (completed.length > 0) {
        return this.deliveryGroupResult(
          user,
          delivery.batchId,
          completed.map((item) => item.id),
        );
      }
      throw new ConflictException('Não há entregas aguardando retorno neste pedido.');
    }

    const settings = await this.platformSettingsService.get();
    const returnProximity = await this.assertNearCompanyAddress(
      delivery.companyId,
      settings.returnProximityRadiusMeters,
      payload,
      'concluir o retorno',
    );
    this.avisarProximidadeNaoValidada(returnProximity, delivery.displayNumber, 'retorno');
    const returnHistoryNote =
      this.proximityHistoryNote(
        returnProximity,
        settings.returnProximityRadiusMeters,
        payload,
        'Retorno',
        'validado',
      ) ?? 'Retorno confirmado pelo motoboy.';

    if (candidates.some((item) => !item.driverId || item.driverValue === null)) {
      throw new InternalServerErrorException(
        'Não foi possível gerar o repasse: há uma entrega de retorno sem entregador ou valor definido.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of candidates) {
          const updated = await tx.delivery.updateMany({
            where: { id: item.id, status: item.status, driverId: driver.id },
            data: { status: 'COMPLETED', statusChangedAt: new Date() },
          });
          if (updated.count !== 1) {
            throw new ConflictException('O retorno já foi concluído por outra solicitação.');
          }
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: item.id,
              fromStatus: item.status,
              toStatus: 'COMPLETED',
              changedByUserId: user.id,
              note: returnHistoryNote,
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
      if (error instanceof ConflictException || this.isRepasseIdempotencyConflict(error)) {
        const completed = await this.completeReturnResultIfApplied(user, id, driver.id);
        if (completed) return completed;
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

  private async completeReturnResultIfApplied(
    user: User,
    id: string,
    driverId: string,
  ): Promise<DeliveryGroupResult | null> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.driverId !== driverId) return null;
    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];
    const stillPending = siblings.some(
      (item) => (item.status === 'DELIVERED' && item.requiresReturn) || item.status === 'FAILED',
    );
    if (stillPending) return null;
    const completed = siblings.filter(
      (item) => item.status === 'COMPLETED' && (item.requiresReturn || item.failedAt !== null),
    );
    if (completed.length === 0) return null;
    return this.deliveryGroupResult(
      user,
      delivery.batchId,
      completed.map((item) => item.id),
    );
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
      message: deliveryActivityMessage({
        displayNumber: delivery.displayNumber,
        companyName: delivery.companyName,
        status: delivery.status,
        driverName: delivery.driver?.name,
      }),
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

    const accumulator = new StageTimesAccumulator({
      excludeRetroactive: filters.excludeRetroactive,
    });
    let cursor: string | undefined;

    do {
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
          id: true,
          statusHistory: {
            select: { fromStatus: true, toStatus: true, changedAt: true, occurredAt: true },
          },
        },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      accumulator.add(deliveries.map((delivery) => delivery.statusHistory));
      if (deliveries.length < 500) break;
      cursor = deliveries.at(-1)?.id;
    } while (cursor);

    return accumulator.result();
  }

  /**
   * Uma chave de repeticao vira um UUID estavel, sem guardar dado novo no
   * banco. O escopo inclui a empresa e o tipo de criacao, portanto a mesma
   * chave pode ser usada por lojas diferentes sem colisao.
   */
  private deterministicUuid(scope: string): string {
    const bytes = createHash('sha256').update(scope).digest().subarray(0, 16);
    // UUID v8 e reservado para esquemas deterministas definidos pela aplicacao.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  /**
   * Se o banco confirmou a criacao mas a resposta ou o despacho falhou, a
   * repeticao retoma apenas o efeito externo. Nao recria endereco nem
   * historico e nao republica DELIVERY_CREATED.
   */
  private async resumeSingleCreation(
    user: User,
    companyId: string,
    deliveryId: string,
  ): Promise<DeliveryDetail | null> {
    const existing = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, companyId: true, status: true, scheduledAt: true },
    });
    if (!existing) {
      return null;
    }
    if (existing.companyId !== companyId) {
      throw new ConflictException('A chave de repeticao ja foi usada em outro pedido.');
    }

    if (existing.status === 'AWAITING_DRIVER') {
      await this.dispatchService.dispatchDelivery(existing.id);
    } else if (existing.status === 'SCHEDULED' && existing.scheduledAt) {
      await this.dispatchService.scheduleActivation(existing.id, existing.scheduledAt);
    }
    return this.detail(user, existing.id);
  }

  private async resumeBatchCreation(
    user: User,
    companyId: string,
    batchId: string,
    expectedDeliveryIds: string[],
  ): Promise<DeliveryBatchDetail | null> {
    const existing = await this.prisma.delivery.findMany({
      where: { batchId },
      select: { id: true, companyId: true, status: true },
    });
    if (existing.length === 0) {
      return null;
    }

    const byId = new Map(existing.map((delivery) => [delivery.id, delivery]));
    const matchesOriginalBatch =
      existing.length === expectedDeliveryIds.length &&
      existing.every((delivery) => delivery.companyId === companyId) &&
      expectedDeliveryIds.every((id) => byId.has(id));
    if (!matchesOriginalBatch) {
      throw new ConflictException('A chave de repeticao ja foi usada em outro lote.');
    }

    const ordered = expectedDeliveryIds.map((id) => byId.get(id)!);
    const awaitingDispatch = ordered.find((delivery) => delivery.status === 'AWAITING_DRIVER');
    if (awaitingDispatch) {
      await this.dispatchService.dispatchDelivery(awaitingDispatch.id);
    }
    return {
      batchId,
      deliveries: await Promise.all(ordered.map((delivery) => this.detail(user, delivery.id))),
    };
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
      where: { userId: user.id, active: true },
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

  /**
   * Devolver a fila um pedido aceito.
   *
   * A checagem de dono e de estado vive no despacho, junto do resto das
   * transicoes que passam por AWAITING_DRIVER — duplicar aqui seria manter duas
   * regras que precisam concordar para sempre.
   *
   * De proposito nao ha checagem de aprovado/ativo: um motoboy que acabou de
   * ser bloqueado precisa poder soltar o pedido que ainda esta com ele, senao a
   * decisao do admin trava a entrega da loja junto.
   */
  async returnToQueue(
    user: User,
    id: string,
    payload: ReturnToQueuePayload,
  ): Promise<{ deliveryId: string; displayNumber: number; returnedCount: number }> {
    const driver = await this.findDriverForUser(user);
    return this.dispatchService.returnDeliveryToQueue(id, driver.id, payload.reason, user.id);
  }

  /**
   * Valida a declaracao de horario de uma marcacao retroativa e devolve a data,
   * ou null quando a marcacao e na hora (o caso normal).
   *
   * O piso e sempre `statusChangedAt` do pedido: o carimbo do estado ATUAL, que
   * e exatamente a etapa anterior a que esta sendo marcada. Numa declaracao
   * anterior ele ja guarda o horario DECLARADO, e nao o do toque — e e isso que
   * faz as declaracoes encadearem certo: quem declarou coleta as 14h consegue
   * declarar entrega as 14h30, mesmo tendo tocado as duas coisas as 15h.
   */
  private resolveRetroactiveAt(
    declared: string | undefined,
    previousAt: Date,
    minMinutes: number | null,
  ): Date | null {
    if (declared === undefined) {
      return null;
    }

    const declaredAt = new Date(declared);
    const problema = checkRetroactiveMarking({
      declaredAt,
      previousAt,
      now: new Date(),
      minMinutes,
    });
    if (problema) {
      throw new ConflictException(describeRetroactiveProblem(problema));
    }
    return declaredAt;
  }

  private async assertNearCompanyAddress(
    companyId: string,
    radiusMeters: number | null,
    payload: ProximityPayload,
    actionLabel: string,
  ): Promise<ProximityOutcome> {
    if (radiusMeters == null) return { kind: 'DESLIGADA' };

    const pickupAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId, isPrimary: true },
      select: { lat: true, lng: true },
    });
    if (!pickupAddress || pickupAddress.lat === null || pickupAddress.lng === null) {
      return { kind: 'SEM_COORDENADAS', targetLabel: 'endereço da empresa' };
    }

    return {
      kind: 'VALIDADA',
      targetLabel: 'endereço da empresa',
      distanceMeters: this.assertWithinConfiguredRadius({
        payload,
        radiusMeters,
        target: { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) },
        actionLabel,
        targetLabel: 'endereço da empresa',
      }),
    };
  }

  private async assertNearDeliveryAddress(
    deliveryId: string,
    radiusMeters: number | null,
    payload: ProximityPayload,
  ): Promise<ProximityOutcome> {
    if (radiusMeters == null) return { kind: 'DESLIGADA' };

    const dropoff = await this.prisma.deliveryAddress.findFirst({
      where: { deliveryId, type: 'DROPOFF' },
      select: { lat: true, lng: true },
    });
    if (!dropoff || dropoff.lat === null || dropoff.lng === null) {
      return { kind: 'SEM_COORDENADAS', targetLabel: 'endereço de entrega' };
    }

    return {
      kind: 'VALIDADA',
      targetLabel: 'endereço de entrega',
      distanceMeters: this.assertWithinConfiguredRadius({
        payload,
        radiusMeters,
        target: { lat: Number(dropoff.lat), lng: Number(dropoff.lng) },
        actionLabel: 'concluir a entrega',
        targetLabel: 'endereço de entrega',
      }),
    };
  }

  /**
   * Avisa o painel quando uma etapa passou sem conferencia de proximidade.
   *
   * A nota no historico prova o que aconteceu, mas so para quem for procurar.
   * Sem este aviso, um cadastro sem coordenada continuaria furando a trava
   * silenciosamente em todo pedido daquela empresa, e a regra que o admin
   * acredita ter ligado nao estaria valendo para ninguem.
   */
  private avisarProximidadeNaoValidada(
    outcome: ProximityOutcome,
    displayNumber: number,
    etapa: string,
  ): void {
    if (outcome.kind !== 'SEM_COORDENADAS') return;

    this.logger.warn(
      `Pedido #${displayNumber}: ${etapa} concluida sem validacao de proximidade — ` +
        `${outcome.targetLabel} sem coordenadas.`,
    );
    this.realtimeGateway.emitAdminActivity(
      `Pedido #${displayNumber}: ${etapa} aceita SEM validar proximidade — o ` +
        `${outcome.targetLabel} está sem coordenadas. Corrija o cadastro para a regra voltar a valer.`,
    );
  }

  /**
   * A linha do historico que descreve a conferencia de proximidade.
   *
   * Quando nao houve conferencia, o texto diz isso com todas as letras e
   * carrega a posicao que o aplicativo enviou. Sem essa posicao registrada, a
   * etapa nao validada nao deixaria evidencia nenhuma de onde o motoboy estava
   * — e e justamente ela que sustenta a auditoria depois.
   */
  private proximityHistoryNote(
    outcome: ProximityOutcome,
    radiusMeters: number | null,
    payload: ProximityPayload,
    stageLabel: string,
    /** "Coleta validada", mas "Retorno validado" — o genero segue o substantivo. */
    participio: 'validada' | 'validado',
  ): string | null {
    if (outcome.kind === 'DESLIGADA') return null;
    if (outcome.kind === 'VALIDADA') {
      return (
        `${stageLabel} ${participio} a ${Math.round(outcome.distanceMeters)}m do ` +
        `${outcome.targetLabel} (raio configurado: ${radiusMeters}m).`
      );
    }
    const posicao =
      payload.lat === undefined || payload.lng === undefined
        ? 'sem posição enviada pelo aplicativo'
        : `posição registrada: ${payload.lat.toFixed(6)}, ${payload.lng.toFixed(6)}` +
          (payload.accuracy === undefined ? '' : ` (precisão de ${Math.round(payload.accuracy)}m)`);
    return (
      `${stageLabel} SEM validação de proximidade: o ${outcome.targetLabel} não tem ` +
      `coordenadas cadastradas (raio configurado: ${radiusMeters}m). ${posicao}.`
    );
  }

  private assertWithinConfiguredRadius(input: {
    payload: ProximityPayload;
    radiusMeters: number;
    target: { lat: number; lng: number };
    actionLabel: string;
    targetLabel: string;
  }): number {
    const { payload, radiusMeters, target, actionLabel, targetLabel } = input;
    if (payload.lat === undefined || payload.lng === undefined) {
      throw new ConflictException(
        `É necessário obter sua localização atual para ${actionLabel}. Ative o GPS e tente novamente.`,
      );
    }
    if (payload.accuracy === undefined) {
      throw new ConflictException(
        `Não foi possível validar a precisão do GPS para ${actionLabel}. Aguarde o sinal estabilizar e tente novamente.`,
      );
    }
    if (payload.accuracy > radiusMeters) {
      throw new ConflictException(
        `A precisão do GPS agora (${Math.round(payload.accuracy)}m) é maior que o raio aceito ` +
          `(${radiusMeters}m). Aguarde o sinal melhorar e tente novamente.`,
      );
    }

    const distanceMeters = haversineDistanceMeters({ lat: payload.lat, lng: payload.lng }, target);
    if (distanceMeters > radiusMeters) {
      throw new ConflictException(
        `Você precisa estar a até ${radiusMeters}m do ${targetLabel} para ${actionLabel} ` +
          `(está a ${Math.round(distanceMeters)}m).`,
      );
    }
    return distanceMeters;
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
      batchId?: string;
      deliveryId?: string;
      from?: string;
      to?: string;
    },
  ): Prisma.DeliveryWhereInput {
    const query = filters.q?.trim();
    /**
     * `displayNumber` e `Int` de 32 bits no Postgres. Um telefone tem 11
     * digitos e estoura esse limite com folga — mandar isso no `where` faz o
     * banco recusar a consulta inteira, e a busca responde 500 em vez de "nada
     * encontrado".
     *
     * O defeito ja existia; passou a ser alcancavel quando a busca por
     * destinatario deu ao operador o motivo de digitar um telefone aqui.
     */
    const MAIOR_DISPLAY_NUMBER = 2_147_483_647;
    const numeroDigitado = query && /^\d+$/.test(query) ? Number(query) : null;
    const parsedDisplayNumber =
      numeroDigitado !== null && numeroDigitado <= MAIOR_DISPLAY_NUMBER ? numeroDigitado : null;
    const isUuid = Boolean(
      query &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query),
    );
    /**
     * O telefone e gravado so com digitos; quem digita costuma trazer mascara.
     * Sem normalizar, procurar "(33) 99999-9991" nunca acha o pedido de quem
     * esta com o cliente na linha.
     */
    const somenteDigitos = query?.replace(/\D/g, '') ?? '';
    const queryFilter: Prisma.DeliveryWhereInput = query
      ? {
          OR: [
            { externalOrderNumber: { contains: query, mode: 'insensitive' } },
            { serviceType: { name: { contains: query, mode: 'insensitive' } } },
            /**
             * Destinatario entra na busca porque a pergunta real de quem opera
             * quase nunca e o numero do pedido: e "cade o pedido da Maria?".
             * A empresa mantem agenda de clientes e ainda assim precisava saber
             * o numero de cor para achar qualquer coisa.
             */
            { recipientName: { contains: query, mode: 'insensitive' } },
            ...(somenteDigitos.length >= 4
              ? [{ recipientPhone: { contains: somenteDigitos } }]
              : []),
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
      ...(filters.batchId && { batchId: filters.batchId }),
      ...(filters.deliveryId && { id: filters.deliveryId }),
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
            avatarUrl: delivery.driver.user.avatarUrl,
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

  /**
   * Coordenadas capturadas fora da malha viaria podem fazer a Routes API
   * responder sem rota. Nesse caso, usa o proprio Google para identificar o
   * endereco daquela coordenada e repete a rota pelo endereco normalizado.
   * Nunca substitui a distancia por linha reta nem inventa preco.
   */
  private async getDistanceToCapturedDestination(
    originAddress: string,
    lat: number,
    lng: number,
    storedOrigin?: { lat: number; lng: number },
  ): Promise<{ distanceKm: number }> {
    try {
      return await this.googleMapsService.getDistance({
        origin: { address: originAddress },
        destination: { lat, lng },
      });
    } catch (error) {
      const noRoute =
        error instanceof GoogleMapsApiError && error.message.includes('sem rota válida');
      if (!noRoute) throw error;

      const origin = storedOrigin ?? (await this.googleMapsService.geocode(originAddress));
      if (origin) {
        try {
          return await this.googleMapsService.getDistance({
            origin,
            destination: { lat, lng },
          });
        } catch (coordinateError) {
          const stillNoRoute =
            coordinateError instanceof GoogleMapsApiError &&
            coordinateError.message.includes('sem rota válida');
          if (!stillNoRoute) throw coordinateError;
        }
      }

      const destination = await this.googleMapsService.reverseGeocode({ lat, lng });
      if (!destination?.street || !destination.city || !destination.state) throw error;

      return this.googleMapsService.getDistance({
        origin: origin ?? { address: originAddress },
        destination: {
          address: this.formatAddress({
            street: destination.street,
            number: destination.number ?? 's/n',
            city: destination.city,
            state: destination.state,
            zip: destination.zip ?? '',
          }),
        },
      });
    }
  }

  private isNoRouteError(error: unknown): boolean {
    return error instanceof GoogleMapsApiError && error.message.includes('sem rota válida');
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
    requiresDeliveryProof: boolean;
    requiresCollectionRecipient: boolean;
    pickupSurchargeChargedToDriver: boolean;
    statusChangedAt: Date;
    pickupDeadlineAt: Date | null;
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
      requiresDeliveryProof: delivery.requiresDeliveryProof,
      requiresCollectionRecipient: delivery.requiresCollectionRecipient,
      pickupSurchargeChargedToDriver: delivery.pickupSurchargeChargedToDriver,
      statusChangedAt: delivery.statusChangedAt.toISOString(),
      pickupDeadlineAt: delivery.pickupDeadlineAt?.toISOString() ?? null,
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
  /**
   * O admin decide se a loja pode lancar lote, e de que tamanho.
   *
   * `maxDeliveriesPerBatch` igual a 1 desliga o lote — a loja passa a lancar um
   * pedido por vez. Nulo mantem o teto do proprio formato, que ja e validado no
   * schema, para nao mudar o comportamento de quem nunca configurou nada.
   *
   * A recusa diz o limite. Uma mensagem so com "nao pode" deixaria a loja
   * tentando adivinhar quantos cabem.
   */
  /**
   * Impede marcar entregue longe do endereco informado.
   *
   * So vale para pedido com destino conhecido na criacao. Quando o destino e
   * definido por GPS na hora, a propria coordenada VIRA o destino, e comparar
   * ela consigo mesma nao provaria nada — ali quem protege e o limite de
   * precisao.
   *
   * A checagem e PULADA em tres casos, todos deliberados:
   *
   * - Marcacao retroativa (`occurredAt`): o motoboy esta dizendo que entregou
   *   antes, de outro lugar. Exigir proximidade agora tornaria "esqueci de
   *   marcar" impossivel de usar.
   * - Endereco sem coordenada: nao ha com o que comparar. Travar o motoboy por
   *   erro de cadastro da loja o deixaria sem receber por uma entrega feita.
   * - App antigo que nao envia posicao: a versao anterior so mandava GPS em
   *   pedido sem destino. Recusar derrubaria toda entrega ate o aplicativo ser
   *   atualizado no aparelho de cada motoboy.
   *
   * Os dois ultimos casos ficam no log, para o admin ver de quais lojas e
   * aparelhos vem a falta de checagem.
   */
  /**
   * Descobre a coordenada do endereco de entrega.
   *
   * Existe porque o endereco chega so como texto: nem o painel da empresa nem
   * as integracoes mandam coordenada. O ponto enriquece mapa e navegacao, mas
   * nao e usado para bloquear a confirmacao do motoboy.
   *
   * Devolve `null` quando o Google nao encontra o endereco ou quando a
   * consulta falha. Nenhum dos dois pode impedir a loja de lancar o pedido —
   * um endereco mal digitado reduz o contexto do mapa, nao trava a operacao.
   */
  private async resolveCompanyCustomerId(
    companyId: string,
    phone?: string,
  ): Promise<string | null> {
    const normalized = phone ? companyCustomerPhoneSchema.safeParse(phone) : null;
    if (!normalized?.success) return null;
    const customer = await this.prisma.companyCustomer.findUnique({
      where: { companyId_phone: { companyId, phone: normalized.data } },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  private async resolveCompanyCustomerIds(
    companyId: string,
    phones: Array<string | undefined>,
  ): Promise<Map<string, string>> {
    const normalizedPhones = [
      ...new Set(
        phones.flatMap((phone) => {
          const parsed = phone ? companyCustomerPhoneSchema.safeParse(phone) : null;
          return parsed?.success ? [parsed.data] : [];
        }),
      ),
    ];
    if (normalizedPhones.length === 0) return new Map();
    const customers = await this.prisma.companyCustomer.findMany({
      where: { companyId, phone: { in: normalizedPhones } },
      select: { id: true, phone: true },
    });
    return new Map(customers.map((customer) => [customer.phone, customer.id]));
  }

  private customerIdFromPhone(
    phone: string | undefined,
    idsByPhone: Map<string, string>,
  ): string | null {
    const parsed = phone ? companyCustomerPhoneSchema.safeParse(phone) : null;
    return parsed?.success ? (idsByPhone.get(parsed.data) ?? null) : null;
  }

  private async resolverCoordenadaDoDestino(endereco: {
    street: string;
    number: string;
    complement?: string | null;
    city: string;
    state: string;
    zip: string;
    lat?: number;
    lng?: number;
  }): Promise<{ lat: number | null; lng: number | null }> {
    if (endereco.lat !== undefined && endereco.lng !== undefined) {
      return { lat: endereco.lat, lng: endereco.lng };
    }

    try {
      const ponto = await this.googleMapsService.geocode(this.formatAddress(endereco));
      if (!ponto) {
        this.avisarDestinoSemCoordenada(
          this.formatAddress(endereco),
          'o Google não encontrou o endereço',
        );
        return { lat: null, lng: null };
      }
      return ponto;
    } catch (erro) {
      this.avisarDestinoSemCoordenada(this.formatAddress(endereco), String(erro));
      return { lat: null, lng: null };
    }
  }

  /**
   * O pedido segue com o endereco em texto, mas ninguem mais fica sabendo
   * disso tarde demais.
   *
   * Este aviso existe porque o silencio aqui era metade do defeito: a criacao
   * aceitava o endereco sem ponto geografico e so a conclusao, horas depois e
   * na mao do motoboy, revelava o problema. Agora o operador ve na hora, com o
   * pedido ainda fresco e o cliente ainda ao telefone.
   */
  private avisarDestinoSemCoordenada(enderecoFormatado: string, motivo: string): void {
    this.logger.warn(
      `Endereco de entrega sem coordenada: "${enderecoFormatado}" — ${motivo}. ` +
        'O pedido seguira com o endereco em texto e a entrega nao tera validacao de proximidade.',
    );
    this.realtimeGateway.emitAdminActivity(
      `Endereço sem coordenadas: "${enderecoFormatado}". O pedido foi criado, mas a entrega ` +
        'não terá validação de proximidade até o endereço ser corrigido.',
    );
  }

  private async assertBatchSizeAllowed(quantidade: number): Promise<void> {
    const { maxDeliveriesPerBatch } = await this.platformSettingsService.get();
    if (maxDeliveriesPerBatch === null || maxDeliveriesPerBatch === undefined) return;
    if (quantidade <= maxDeliveriesPerBatch) return;

    throw new ConflictException(
      maxDeliveriesPerBatch === 1
        ? 'O lançamento em lote está desativado. Lance um pedido por vez.'
        : `Um lote pode ter no máximo ${maxDeliveriesPerBatch} pedidos.`,
    );
  }

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
