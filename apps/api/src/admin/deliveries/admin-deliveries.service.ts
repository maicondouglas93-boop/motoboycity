import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { DeliveryStatus, Prisma, User } from '@prisma/client';
import type {
  CreateDeliveryPayload,
  ForceCompletePayload,
  ManualDeliveryStagePayload,
  ReassignDriverPayload,
} from '@motoboycity/validation';
import { DeliveriesService, type DeliveryDetail } from '../../deliveries/deliveries.service';
import { FinanceLedgerService } from '../../finance/finance-ledger.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Intervenções manuais do admin sobre um pedido.
 *
 * São o admin sobrescrevendo o que aconteceu na rua, então cada uma grava
 * autor e motivo no histórico do pedido — sem isso a auditoria mostra que algo
 * mudou e não mostra por quê.
 *
 * O limite de todas elas é o mesmo: **dinheiro já creditado não se mexe aqui**.
 * O repasse nasce em COMPLETED, com chave de idempotência por entrega; desfazer
 * ou transferir um crédito já lançado é outra operação, com estorno e trilha
 * própria, e não cabe num menu de contexto.
 */

/** Estados em que a entrega tem entregador e o repasse ainda não existe. */
const REASSIGNABLE_STATUSES: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];

/** Estados que estão esperando o motoboy confirmar algo que ele não confirmou. */
const FORCE_COMPLETABLE_STATUSES: DeliveryStatus[] = ['DELIVERED', 'FAILED'];

/** Estados que provam que a coleta ja foi registrada. */
const POST_COLLECTION_STATUSES: DeliveryStatus[] = [
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'COMPLETED',
];

@Injectable()
export class AdminDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveriesService: DeliveriesService,
    private readonly financeLedgerService: FinanceLedgerService,
  ) {}

  createForCompany(
    admin: User,
    companyId: string,
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.createForCompany(admin, companyId, payload);
  }

  updateBeforeAcceptance(
    admin: User,
    deliveryId: string,
    payload: CreateDeliveryPayload,
  ): Promise<DeliveryDetail> {
    return this.deliveriesService.updateBeforeAcceptance(admin, deliveryId, payload);
  }

  /**
   * Troca o entregador de um pedido em andamento.
   *
   * O caso real: o motoboy que aceitou quebrou a moto, passou mal ou sumiu, e
   * alguém precisa assumir sem perder o número do pedido nem a hora de criação
   * — que é o que cancelar e recriar destruiria.
   */
  async reassignDriver(
    admin: User,
    deliveryId: string,
    payload: ReassignDriverPayload,
  ): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (!REASSIGNABLE_STATUSES.includes(delivery.status)) {
      /**
       * COMPLETED fica de fora por causa do dinheiro: o repasse já está na
       * carteira do entregador antigo, e trocar o nome no pedido deixaria o
       * crédito com quem não fez a entrega.
       */
      throw new ConflictException(
        'Só é possível trocar o entregador enquanto o pedido está em andamento.',
      );
    }
    if (delivery.driverId === payload.driverId) {
      throw new ConflictException('Este pedido já está com esse entregador.');
    }

    const novo = await this.prisma.driver.findUnique({
      where: { id: payload.driverId },
      include: { user: { select: { name: true } } },
    });
    if (!novo) {
      throw new NotFoundException('Entregador não encontrado.');
    }
    /**
     * A mesma elegibilidade que o despacho automático exige, menos a
     * disponibilidade: aqui o admin está atribuindo de propósito, e exigir que
     * o motoboy esteja marcado como disponível impediria justamente o resgate
     * de um pedido travado.
     */
    if (novo.approvalStatus !== 'APPROVED' || novo.accountStatus !== 'ACTIVE') {
      throw new ConflictException('Este entregador não está aprovado e ativo.');
    }

    const anterior = delivery.driverId
      ? await this.prisma.driver.findUnique({
          where: { id: delivery.driverId },
          include: { user: { select: { name: true } } },
        })
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { driverId: payload.driverId },
      });
      /**
       * O status não muda — só o entregador. A linha de histórico registra a
       * troca com `fromStatus` igual a `toStatus` de propósito: não foi uma
       * transição de estado, foi uma intervenção dentro do mesmo estado.
       */
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: delivery.status,
          changedByUserId: admin.id,
          note:
            `Entregador alterado de ${anterior?.user.name ?? 'nenhum'} para ${novo.user.name} ` +
            `pelo administrador. Motivo: ${payload.reason}`,
        },
      });
    });

    const detail = await this.deliveriesService.detail(admin, deliveryId);
    this.deliveriesService.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  /**
   * Confirma a coleta pelo painel. Em lote, preserva a regra operacional de
   * coleta unica: todos os itens aceitos avancam na mesma transacao.
   */
  async markCollected(
    admin: User,
    deliveryId: string,
    payload: ManualDeliveryStagePayload,
  ): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const siblings = delivery.batchId
      ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
      : [delivery];

    if (siblings.every((item) => POST_COLLECTION_STATUSES.includes(item.status))) {
      return this.deliveriesService.detail(admin, deliveryId);
    }
    if (siblings.some((item) => item.status !== 'ACCEPTED')) {
      throw new ConflictException(
        'Todos os itens do pedido precisam estar aceitos para marcar a coleta.',
      );
    }
    if (
      !delivery.driverId ||
      siblings.some((item) => !item.driverId || item.driverId !== delivery.driverId)
    ) {
      throw new ConflictException('O pedido precisa estar atribuído ao mesmo entregador.');
    }

    const changedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const item of siblings) {
          const updated = await tx.delivery.updateMany({
            where: { id: item.id, status: 'ACCEPTED', driverId: delivery.driverId },
            data: { status: 'COLLECTED', statusChangedAt: changedAt },
          });
          if (updated.count !== 1) {
            throw new ConflictException('A coleta já foi registrada por outra solicitação.');
          }
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId: item.id,
              fromStatus: 'ACCEPTED',
              toStatus: 'COLLECTED',
              changedByUserId: admin.id,
              note: `Coleta marcada manualmente pelo administrador. Motivo: ${payload.reason}`,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const current = delivery.batchId
          ? await this.prisma.delivery.findMany({ where: { batchId: delivery.batchId } })
          : [await this.prisma.delivery.findUnique({ where: { id: deliveryId } })].filter(
              (item) => item !== null,
            );
        if (
          current.length > 0 &&
          current.every((item) => POST_COLLECTION_STATUSES.includes(item.status))
        ) {
          return this.deliveriesService.detail(admin, deliveryId);
        }
      }
      throw error;
    }

    const details = await Promise.all(
      siblings.map((item) => this.deliveriesService.detail(admin, item.id)),
    );
    details.forEach((detail) =>
      this.deliveriesService.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED'),
    );
    return details.find((detail) => detail.id === deliveryId) ?? details[0]!;
  }

  /**
   * Confirma a entrega pelo painel. Destino calculado por GPS fica de fora:
   * sem uma coordenada real nao existe distancia nem preco seguros para gravar.
   */
  async markDelivered(
    admin: User,
    deliveryId: string,
    payload: ManualDeliveryStagePayload,
  ): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (
      (delivery.status === 'DELIVERED' || delivery.status === 'COMPLETED') &&
      delivery.failedAt === null
    ) {
      return this.deliveriesService.detail(admin, deliveryId);
    }
    if (delivery.status !== 'COLLECTED') {
      throw new ConflictException('O pedido precisa estar coletado antes da entrega.');
    }
    if (!delivery.destinationKnownAtCreation) {
      throw new ConflictException(
        'Este pedido calcula o valor pela localização da entrega. Confirme pelo aplicativo do motoboy.',
      );
    }
    if (!delivery.driverId || delivery.driverValue === null) {
      throw new InternalServerErrorException(
        'Não foi possível concluir: a entrega não tem entregador ou valor definido.',
      );
    }

    const nextStatus: DeliveryStatus = delivery.requiresReturn ? 'DELIVERED' : 'COMPLETED';
    const changedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.delivery.updateMany({
          where: { id: deliveryId, status: 'COLLECTED', driverId: delivery.driverId },
          data: { status: nextStatus, statusChangedAt: changedAt },
        });
        if (updated.count !== 1) {
          throw new ConflictException('A entrega já foi registrada por outra solicitação.');
        }

        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId,
            fromStatus: 'COLLECTED',
            toStatus: 'DELIVERED',
            changedByUserId: admin.id,
            note: `Entrega marcada manualmente pelo administrador. Motivo: ${payload.reason}`,
          },
        });

        if (nextStatus === 'COMPLETED') {
          await tx.deliveryStatusHistory.create({
            data: {
              deliveryId,
              fromStatus: 'DELIVERED',
              toStatus: 'COMPLETED',
              changedByUserId: admin.id,
              note: 'Conclusão automática após entrega sem retorno.',
            },
          });
          await this.financeLedgerService.creditDriverRepasse(tx, {
            id: deliveryId,
            driverId: delivery.driverId,
            driverValue: delivery.driverValue,
          });
        }
      });
    } catch (error) {
      if (error instanceof ConflictException || this.isRepasseConflict(error)) {
        const current = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
        if (
          current?.driverId === delivery.driverId &&
          (current.status === 'DELIVERED' || current.status === 'COMPLETED') &&
          current.failedAt === null
        ) {
          return this.deliveriesService.detail(admin, deliveryId);
        }
      }
      throw error;
    }

    const detail = await this.deliveriesService.detail(admin, deliveryId);
    this.deliveriesService.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  /**
   * Fecha um pedido que ficou esperando confirmação do motoboy.
   *
   * O caso real: ele entregou e não apertou "voltei à loja", então o pedido
   * fica parado em DELIVERED para sempre e o repasse dele nunca sai. Faz
   * exatamente o que `completeReturn` faz — inclusive creditar o repasse — mas
   * sem a checagem de proximidade, porque o ponto é justamente que ninguém
   * confirmou no lugar certo.
   */
  async forceComplete(
    admin: User,
    deliveryId: string,
    payload: ForceCompletePayload,
  ): Promise<DeliveryDetail> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (!FORCE_COMPLETABLE_STATUSES.includes(delivery.status)) {
      throw new ConflictException(
        'Só é possível finalizar um pedido que já foi entregue ou marcado como não entregue.',
      );
    }
    if (!delivery.driverId || delivery.driverValue === null) {
      throw new InternalServerErrorException(
        'Não foi possível gerar o repasse: a entrega não tem entregador ou valor definido.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.delivery.update({
          where: { id: deliveryId },
          data: { status: 'COMPLETED', statusChangedAt: new Date() },
        });
        await tx.deliveryStatusHistory.create({
          data: {
            deliveryId,
            fromStatus: delivery.status,
            toStatus: 'COMPLETED',
            changedByUserId: admin.id,
            note: `Finalizado manualmente pelo administrador, sem confirmação de retorno do entregador. Motivo: ${payload.reason}`,
          },
        });
        await this.financeLedgerService.creditDriverRepasse(tx, {
          id: deliveryId,
          driverId: delivery.driverId,
          driverValue: delivery.driverValue,
        });
      });
    } catch (error) {
      /**
       * A chave de idempotência do repasse é por entrega. Se dois admins
       * apertarem ao mesmo tempo, o segundo esbarra nela — e isso é a proteção
       * funcionando, não um erro a esconder.
       */
      if (this.isRepasseConflict(error)) {
        throw new ConflictException('Este pedido já foi finalizado. Atualize a tela.');
      }
      throw error;
    }

    const detail = await this.deliveriesService.detail(admin, deliveryId);
    this.deliveriesService.publishDeliveryUpdate(detail, 'DELIVERY_STATUS_CHANGED');
    return detail;
  }

  private isRepasseConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
