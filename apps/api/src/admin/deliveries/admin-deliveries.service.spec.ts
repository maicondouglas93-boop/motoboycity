import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { FinanceLedgerService } from '../../finance/finance-ledger.service';
import { IntegrationOutboxRecorder } from '../../integrations/integration-outbox-recorder.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDeliveriesService } from './admin-deliveries.service';

const admin = { id: 'admin-1', type: 'ADMIN' } as User;

const motoboyApto = {
  id: 'driver-2',
  approvalStatus: 'APPROVED',
  accountStatus: 'ACTIVE',
  user: { name: 'Novo Motoboy' },
};

function entrega(over: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    batchId: null,
    status: 'COLLECTED',
    driverId: 'driver-1',
    driverValue: 10,
    destinationKnownAtCreation: true,
    requiresReturn: false,
    failedAt: null,
    ...over,
  };
}

describe('AdminDeliveriesService', () => {
  let service: AdminDeliveriesService;
  let prisma: {
    delivery: { findUnique: jest.Mock; findMany: jest.Mock };
    driver: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    delivery: { update: jest.Mock; updateMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock };
  };
  let deliveriesService: {
    createForCompany: jest.Mock;
    detail: jest.Mock;
    publishDeliveryUpdate: jest.Mock;
  };
  let financeLedgerService: { creditDriverRepasse: jest.Mock };

  beforeEach(async () => {
    tx = {
      delivery: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryStatusHistory: { create: jest.fn() },
    };
    prisma = {
      delivery: { findUnique: jest.fn(), findMany: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    deliveriesService = {
      createForCompany: jest.fn().mockResolvedValue({ id: 'delivery-created' }),
      detail: jest.fn((_admin: User, id: string) => Promise.resolve({ id })),
      publishDeliveryUpdate: jest.fn(),
    };
    financeLedgerService = { creditDriverRepasse: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDeliveriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveriesService, useValue: deliveriesService },
        { provide: FinanceLedgerService, useValue: financeLedgerService },
        { provide: IntegrationOutboxRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(AdminDeliveriesService);
  });

  it('delega a criacao para a empresa escolhida preservando o admin como autor', async () => {
    const payload = {
      serviceTypeId: 'service-1',
      destinationKnownAtCreation: false,
      requiresReturn: false,
      requiresDeliveryProof: false,
      requiresCollectionRecipient: false,
      pickupSurchargeChargedToDriver: false,
    };

    await service.createForCompany(admin, 'company-1', payload);

    expect(deliveriesService.createForCompany).toHaveBeenCalledWith(admin, 'company-1', payload);
  });

  describe('trocar entregador', () => {
    it('retorna 404 quando o pedido não existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(
        service.reassignDriver(admin, 'inexistente', {
          driverId: 'driver-2',
          reason: 'moto quebrou',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['COMPLETED', 'CANCELLED', 'AWAITING_DRIVER', 'SCHEDULED'] as const)(
      'recusa trocar em %s',
      async (status) => {
        prisma.delivery.findUnique.mockResolvedValue(entrega({ status }));

        await expect(
          service.reassignDriver(admin, 'delivery-1', {
            driverId: 'driver-2',
            reason: 'moto quebrou',
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('COMPLETED fica de fora por causa do repasse já creditado', async () => {
      // O credito ja esta na carteira do entregador antigo; trocar o nome no
      // pedido deixaria o dinheiro com quem nao fez a entrega.
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'COMPLETED' }));

      await expect(
        service.reassignDriver(admin, 'delivery-1', { driverId: 'driver-2', reason: 'engano' }),
      ).rejects.toThrow('em andamento');
    });

    it('recusa trocar para o mesmo entregador', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ driverId: 'driver-2' }));

      await expect(
        service.reassignDriver(admin, 'delivery-1', { driverId: 'driver-2', reason: 'engano' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa entregador não aprovado', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega());
      prisma.driver.findUnique.mockResolvedValue({
        ...motoboyApto,
        approvalStatus: 'PENDING',
      });

      await expect(
        service.reassignDriver(admin, 'delivery-1', {
          driverId: 'driver-2',
          reason: 'moto quebrou',
        }),
      ).rejects.toThrow('aprovado e ativo');
    });

    it('recusa entregador com conta bloqueada', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega());
      prisma.driver.findUnique.mockResolvedValue({ ...motoboyApto, accountStatus: 'BLOCKED' });

      await expect(
        service.reassignDriver(admin, 'delivery-1', {
          driverId: 'driver-2',
          reason: 'moto quebrou',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('troca e registra autor e motivo no histórico', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega());
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo Motoboy' } });

      await service.reassignDriver(admin, 'delivery-1', {
        driverId: 'driver-2',
        reason: 'moto quebrou na estrada',
      });

      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { driverId: 'driver-2' },
      });
      const historico = tx.deliveryStatusHistory.create.mock.calls[0]?.[0]?.data;
      expect(historico.changedByUserId).toBe('admin-1');
      expect(historico.note).toContain('moto quebrou na estrada');
      expect(historico.note).toContain('Novo Motoboy');
      // Intervencao dentro do mesmo estado, e nao transicao: o status nao muda.
      expect(historico.fromStatus).toBe('COLLECTED');
      expect(historico.toStatus).toBe('COLLECTED');
    });

    it('não credita repasse ao trocar de entregador', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega());
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo' } });

      await service.reassignDriver(admin, 'delivery-1', {
        driverId: 'driver-2',
        reason: 'moto quebrou',
      });

      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });
  });

  describe('finalizar manualmente', () => {
    it.each(['DELIVERED', 'FAILED'] as const)('aceita finalizar em %s', async (status) => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status }));

      await service.forceComplete(admin, 'delivery-1', { reason: 'motoboy nao confirmou' });

      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { status: 'COMPLETED', statusChangedAt: expect.any(Date) },
      });
    });

    it.each(['ACCEPTED', 'COLLECTED', 'COMPLETED', 'CANCELLED', 'AWAITING_DRIVER'] as const)(
      'recusa finalizar em %s',
      async (status) => {
        prisma.delivery.findUnique.mockResolvedValue(entrega({ status }));

        await expect(
          service.forceComplete(admin, 'delivery-1', { reason: 'motoboy sumiu' }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
      },
    );

    it('credita o repasse ao finalizar — é o motivo de a ação existir', async () => {
      // O caso real: entregou e nao apertou "voltei", entao o pedido fica
      // parado e o dinheiro dele nunca sai.
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'DELIVERED' }));

      await service.forceComplete(admin, 'delivery-1', { reason: 'confirmado por telefone' });

      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(tx, {
        id: 'delivery-1',
        driverId: 'driver-1',
        driverValue: 10,
      });
    });

    it('registra autor e motivo', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'DELIVERED' }));

      await service.forceComplete(admin, 'delivery-1', { reason: 'confirmado por telefone' });

      const historico = tx.deliveryStatusHistory.create.mock.calls[0]?.[0]?.data;
      expect(historico.changedByUserId).toBe('admin-1');
      expect(historico.note).toContain('confirmado por telefone');
      expect(historico.note).toContain('sem confirmação de retorno');
    });

    it('a chave de idempotência do repasse vira conflito legível', async () => {
      // Dois admins apertando ao mesmo tempo: o segundo esbarra na chave, e
      // isso e a protecao funcionando.
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'DELIVERED' }));
      prisma.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        service.forceComplete(admin, 'delivery-1', { reason: 'confirmado' }),
      ).rejects.toThrow('já foi finalizado');
    });
  });

  describe('marcar coleta manualmente', () => {
    it('avanca ACCEPTED e registra autor e motivo', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'ACCEPTED' }));

      await service.markCollected(admin, 'delivery-1', { reason: 'confirmado com a loja' });

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'ACCEPTED', driverId: 'driver-1' },
        data: { status: 'COLLECTED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'delivery-1',
          fromStatus: 'ACCEPTED',
          toStatus: 'COLLECTED',
          changedByUserId: 'admin-1',
          note: expect.stringContaining('confirmado com a loja'),
        }),
      });
    });

    it('preserva a coleta atomica do lote', async () => {
      const first = entrega({ id: 'delivery-1', batchId: 'batch-1', status: 'ACCEPTED' });
      const second = entrega({ id: 'delivery-2', batchId: 'batch-1', status: 'ACCEPTED' });
      prisma.delivery.findUnique.mockResolvedValue(first);
      prisma.delivery.findMany.mockResolvedValue([first, second]);

      await service.markCollected(admin, 'delivery-1', { reason: 'lote retirado na loja' });

      expect(tx.delivery.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(2);
      expect(deliveriesService.publishDeliveryUpdate).toHaveBeenCalledTimes(2);
    });

    it('recusa pedido que ainda nao foi aceito', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'AWAITING_DRIVER' }));

      await expect(
        service.markCollected(admin, 'delivery-1', { reason: 'pedido sem aceite' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('trata repeticao concorrente como idempotente', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce(entrega({ status: 'ACCEPTED' }))
        .mockResolvedValueOnce(entrega({ status: 'COLLECTED' }));
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markCollected(admin, 'delivery-1', { reason: 'confirmado duas vezes' }),
      ).resolves.toEqual({ id: 'delivery-1' });
    });
  });

  describe('marcar entrega manualmente', () => {
    it('mantem DELIVERED quando ha retorno e nao credita antes da volta', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ requiresReturn: true }));

      await service.markDelivered(admin, 'delivery-1', { reason: 'cliente confirmou entrega' });

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: { status: 'DELIVERED', statusChangedAt: expect.any(Date) },
      });
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('fecha e credita quando a entrega nao exige retorno', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ requiresReturn: false }));

      await service.markDelivered(admin, 'delivery-1', { reason: 'confirmado por telefone' });

      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(2);
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(tx, {
        id: 'delivery-1',
        driverId: 'driver-1',
        driverValue: 10,
      });
    });

    it('recusa entrega com destino que ainda depende do GPS', async () => {
      prisma.delivery.findUnique.mockResolvedValue(
        entrega({ destinationKnownAtCreation: false, driverValue: null }),
      );

      await expect(
        service.markDelivered(admin, 'delivery-1', { reason: 'sem coordenada da entrega' }),
      ).rejects.toThrow('localização da entrega');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa marcar entregue antes da coleta', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'ACCEPTED' }));

      await expect(
        service.markDelivered(admin, 'delivery-1', { reason: 'etapa incorreta' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
