import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { FinanceLedgerService } from '../../finance/finance-ledger.service';
import { IntegrationOutboxRecorder } from '../../integrations/integration-outbox-recorder.service';
import { PricingService } from '../../pricing/pricing.service';
import { DispatchService } from '../../dispatch/dispatch.service';
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
    company: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    delivery: { update: jest.Mock; updateMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock; createMany: jest.Mock };
  };
  let deliveriesService: {
    createForCompany: jest.Mock;
    detail: jest.Mock;
    publishDeliveryUpdate: jest.Mock;
  };
  let financeLedgerService: { creditDriverRepasse: jest.Mock };
  let pricingService: { quote: jest.Mock };
  let dispatchService: { novoPrazoDeColeta: jest.Mock; agendarPrazoDeColeta: jest.Mock };

  beforeEach(async () => {
    tx = {
      delivery: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryStatusHistory: { create: jest.fn(), createMany: jest.fn() },
    };
    prisma = {
      delivery: { findUnique: jest.fn(), findMany: jest.fn() },
      driver: { findUnique: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ regionId: 'region-1' }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    deliveriesService = {
      createForCompany: jest.fn().mockResolvedValue({ id: 'delivery-created' }),
      detail: jest.fn((_admin: User, id: string) => Promise.resolve({ id })),
      publishDeliveryUpdate: jest.fn(),
    };
    financeLedgerService = { creditDriverRepasse: jest.fn() };
    dispatchService = {
      novoPrazoDeColeta: jest.fn().mockResolvedValue(null),
      agendarPrazoDeColeta: jest.fn().mockResolvedValue(undefined),
    };
    pricingService = {
      quote: jest.fn().mockResolvedValue({
        totalValue: 12,
        driverValue: 9.6,
        platformValue: 2.4,
        returnValue: 0,
        surchargeLabel: null,
        surchargeValue: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDeliveriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveriesService, useValue: deliveriesService },
        { provide: FinanceLedgerService, useValue: financeLedgerService },
        { provide: IntegrationOutboxRecorder, useValue: { record: jest.fn() } },
        { provide: PricingService, useValue: pricingService },
        { provide: DispatchService, useValue: dispatchService },
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

      // Condicional: sem o status e o entregador atual no `where`, uma
      // finalizacao concorrente trocaria o dono de um pedido ja COMPLETED.
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['delivery-1'] }, status: 'COLLECTED', driverId: 'driver-1' },
        data: { driverId: 'driver-2' },
      });
      const historico = tx.deliveryStatusHistory.createMany.mock.calls[0]?.[0]?.data[0];
      expect(historico.changedByUserId).toBe('admin-1');
      expect(historico.note).toContain('moto quebrou na estrada');
      expect(historico.note).toContain('Novo Motoboy');
      // Intervencao dentro do mesmo estado, e nao transicao: o status nao muda.
      expect(historico.fromStatus).toBe('COLLECTED');
      expect(historico.toStatus).toBe('COLLECTED');
    });

    /**
     * Trocar so um item deixava duas pessoas donas do mesmo lote, e a coleta
     * fechava dos dois lados: cada motoboy batia no item do outro. O unico
     * jeito de sair era reatribuir de volta — e nada dizia isso a ninguem.
     */
    it('o lote troca de dono inteiro', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ batchId: 'batch-1' }));
      prisma.delivery.findMany.mockResolvedValue([
        entrega({ id: 'delivery-1', batchId: 'batch-1' }),
        entrega({ id: 'delivery-2', batchId: 'batch-1' }),
      ]);
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo' } });
      tx.delivery.updateMany.mockResolvedValue({ count: 2 });

      await service.reassignDriver(admin, 'delivery-1', {
        driverId: 'driver-2',
        reason: 'moto quebrou',
      });

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['delivery-1', 'delivery-2'] },
          status: 'COLLECTED',
          driverId: 'driver-1',
        },
        data: { driverId: 'driver-2' },
      });
      expect(tx.deliveryStatusHistory.createMany.mock.calls[0]?.[0]?.data).toHaveLength(2);
    });

    it('recusa quando os itens do lote estão em estados diferentes', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ batchId: 'batch-1' }));
      prisma.delivery.findMany.mockResolvedValue([
        entrega({ id: 'delivery-1', batchId: 'batch-1', status: 'COLLECTED' }),
        entrega({ id: 'delivery-2', batchId: 'batch-1', status: 'DELIVERED' }),
      ]);
      prisma.driver.findUnique.mockResolvedValue(motoboyApto);

      await expect(
        service.reassignDriver(admin, 'delivery-1', { driverId: 'driver-2', reason: 'sumiu' }),
      ).rejects.toThrow('estados diferentes');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * O job pendente carrega o entregador antigo e vira no-op depois da troca.
     * Sem renovar, justamente o pedido que precisou de intervencao ficava sem
     * ninguem cobrando a coleta, com um prazo decorativo no banco.
     */
    it('renova o prazo de coleta para o novo entregador em ACCEPTED', async () => {
      const novoPrazo = new Date(Date.now() + 900_000);
      dispatchService.novoPrazoDeColeta.mockResolvedValue(novoPrazo);
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'ACCEPTED' }));
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo' } });

      await service.reassignDriver(admin, 'delivery-1', {
        driverId: 'driver-2',
        reason: 'moto quebrou',
      });

      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { driverId: 'driver-2', pickupDeadlineAt: novoPrazo },
        }),
      );
      expect(dispatchService.agendarPrazoDeColeta).toHaveBeenCalledWith(
        'delivery-1',
        'driver-2',
        novoPrazo,
      );
    });

    it('não mexe no prazo de coleta depois da coleta', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ status: 'COLLECTED' }));
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo' } });

      await service.reassignDriver(admin, 'delivery-1', {
        driverId: 'driver-2',
        reason: 'moto quebrou',
      });

      expect(dispatchService.agendarPrazoDeColeta).not.toHaveBeenCalled();
    });

    it('não troca o entregador se o pedido mudou durante a operação', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega());
      prisma.driver.findUnique
        .mockResolvedValueOnce(motoboyApto)
        .mockResolvedValueOnce({ id: 'driver-1', user: { name: 'Antigo' } });
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reassignDriver(admin, 'delivery-1', { driverId: 'driver-2', reason: 'sumiu' }),
      ).rejects.toThrow('mudou enquanto o entregador era trocado');
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

    /**
     * A saida que faltava. Sem ela, um pedido de preco diferido que o
     * aplicativo nao conseguisse concluir ficava preso em COLLECTED para
     * sempre: o motoboy nao fechava e o painel recusava por falta de preco.
     */
    it('fecha o pedido de preço diferido com a distância informada pelo admin', async () => {
      prisma.delivery.findUnique.mockResolvedValue(
        entrega({ destinationKnownAtCreation: false, driverValue: null, requiresReturn: false }),
      );

      await service.markDelivered(admin, 'delivery-1', {
        reason: 'aplicativo nao concluiu; distancia conferida com o motoboy',
        distanceKm: 3.2,
      });

      // O preco vem da tabela vigente, nunca de conta local.
      expect(pricingService.quote).toHaveBeenCalledWith(
        expect.objectContaining({ distanceKm: 3.2, requiresReturn: false }),
      );
      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            distanceKm: 3.2,
            totalValue: 12,
            driverValue: 9.6,
          }),
        }),
      );
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(tx, {
        id: 'delivery-1',
        driverId: 'driver-1',
        driverValue: 9.6,
      });
    });

    it('a distância informada fica no histórico, junto com o motivo', async () => {
      prisma.delivery.findUnique.mockResolvedValue(
        entrega({ destinationKnownAtCreation: false, driverValue: null, requiresReturn: false }),
      );

      await service.markDelivered(admin, 'delivery-1', {
        reason: 'conferido com o motoboy',
        distanceKm: 3.2,
      });

      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: expect.stringContaining('Distância informada pelo administrador: 3.2 km'),
          }),
        }),
      );
    });

    it('continua recusando o preço diferido quando a distância não vem', async () => {
      prisma.delivery.findUnique.mockResolvedValue(
        entrega({ destinationKnownAtCreation: false, driverValue: null }),
      );

      await expect(
        service.markDelivered(admin, 'delivery-1', { reason: 'sem coordenada da entrega' }),
      ).rejects.toThrow('Informe a distância');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * Ignorar o numero em silencio faria o admin acreditar que mudou o preco de
     * um pedido que ja tinha valor congelado.
     */
    it('recusa distância informada num pedido que já tem valor', async () => {
      prisma.delivery.findUnique.mockResolvedValue(entrega({ requiresReturn: false }));

      await expect(
        service.markDelivered(admin, 'delivery-1', { reason: 'tentativa', distanceKm: 5 }),
      ).rejects.toThrow('já tem valor calculado');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
