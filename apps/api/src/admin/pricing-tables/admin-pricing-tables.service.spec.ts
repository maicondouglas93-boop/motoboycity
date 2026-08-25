import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminPricingTablesService } from './admin-pricing-tables.service';

const actorUserId = 'admin-1';

describe('AdminPricingTablesService', () => {
  let service: AdminPricingTablesService;
  let tx: {
    pricingTable: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let audit: { record: jest.Mock };
  let prisma: {
    serviceType: { findUnique: jest.Mock };
    company: { findUnique: jest.Mock };
    region: { findFirst: jest.Mock };
    pricingTable: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    tx = {
      pricingTable: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma = {
      serviceType: { findUnique: jest.fn() },
      company: { findUnique: jest.fn() },
      region: { findFirst: jest.fn() },
      pricingTable: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPricingTablesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminPricingTablesService);
  });

  describe('list', () => {
    it('mapeia tabelas de preço, convertendo Decimal para number', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceType: { name: 'Moto' },
          companyId: null,
          company: null,
          baseFee: { toString: () => '5.00' },
          includedDistanceKm: { toString: () => '0.00' },
          perKmFee: { toString: () => '1.50' },
          minimumFee: { toString: () => '8.00' },
          returnFee: { toString: () => '3.00' },
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.list({});

      expect(result).toEqual([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Moto',
          companyId: null,
          companyName: null,
          baseFee: 5,
          includedDistanceKm: 0,
          perKmFee: 1.5,
          minimumFee: 8,
          returnFee: 3,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('mapeia minimumFee/returnFee null corretamente', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceType: { name: 'Moto' },
          companyId: null,
          company: null,
          baseFee: { toString: () => '5.00' },
          includedDistanceKm: { toString: () => '0.00' },
          perKmFee: { toString: () => '1.50' },
          minimumFee: null,
          returnFee: null,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.list({});

      expect(result[0]?.minimumFee).toBeNull();
      expect(result[0]?.returnFee).toBeNull();
    });

    it('repassa filtros serviceTypeId e active para a query', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([]);

      await service.list({ serviceTypeId: 'st-1', companyId: 'company-1', active: true });

      expect(prisma.pricingTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceTypeId: 'st-1', companyId: 'company-1', active: true },
        }),
      );
    });
  });

  describe('create', () => {
    const payload = {
      serviceTypeId: 'st-1',
      baseFee: 5,
      perKmFee: 1.5,
      minimumFee: 8,
      returnFee: 3,
    };

    it('cria uma nova tabela de preços e desativa a anterior da mesma região+serviço', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      tx.pricingTable.create.mockResolvedValue({
        id: 'pt-2',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        companyId: null,
        company: null,
        baseFee: { toString: () => '5.00' },
        includedDistanceKm: { toString: () => '0.00' },
        perKmFee: { toString: () => '1.50' },
        minimumFee: { toString: () => '8.00' },
        returnFee: { toString: () => '3.00' },
        active: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.create(payload, actorUserId);

      expect(tx.pricingTable.updateMany).toHaveBeenCalledWith({
        where: {
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          companyId: null,
          active: true,
        },
        data: { active: false },
      });
      expect(tx.pricingTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            regionId: 'region-1',
            serviceTypeId: 'st-1',
            companyId: null,
            baseFee: 5,
            includedDistanceKm: 0,
            perKmFee: 1.5,
            minimumFee: 8,
            returnFee: 3,
          }),
        }),
      );
      expect(result.id).toBe('pt-2');
      expect(result.active).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          action: 'PRICING_TABLE_CREATED',
          entityType: 'PRICING_TABLE',
          entityId: 'pt-2',
        }),
        tx,
      );
    });

    it('cria preço personalizado na região da empresa sem desativar a tabela geral', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        region: { id: 'region-2', active: true },
      });
      tx.pricingTable.create.mockResolvedValue({
        id: 'pt-company',
        regionId: 'region-2',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        companyId: 'company-1',
        company: { tradeName: 'Loja Especial' },
        baseFee: { toString: () => '4.00' },
        includedDistanceKm: { toString: () => '2.00' },
        perKmFee: { toString: () => '1.20' },
        minimumFee: null,
        returnFee: null,
        active: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.create(
        {
          ...payload,
          companyId: 'company-1',
          includedDistanceKm: 2,
        },
        actorUserId,
      );

      expect(prisma.region.findFirst).not.toHaveBeenCalled();
      expect(tx.pricingTable.updateMany).toHaveBeenCalledWith({
        where: {
          regionId: 'region-2',
          serviceTypeId: 'st-1',
          companyId: 'company-1',
          active: true,
        },
        data: { active: false },
      });
      expect(tx.pricingTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            regionId: 'region-2',
            companyId: 'company-1',
            includedDistanceKm: 2,
          }),
        }),
      );
      expect(result.companyName).toBe('Loja Especial');
    });

    it('repete a transação serializável quando outra atualização concorre no mesmo escopo', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
      tx.pricingTable.create.mockResolvedValue({
        id: 'pt-retried',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        companyId: null,
        company: null,
        baseFee: { toString: () => '5.00' },
        includedDistanceKm: { toString: () => '0.00' },
        perKmFee: { toString: () => '1.50' },
        minimumFee: { toString: () => '8.00' },
        returnFee: { toString: () => '3.00' },
        active: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.create(payload, actorUserId);

      expect(result.id).toBe('pt-retried');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('retorna conflito depois de três disputas consecutivas pelo preço ativo', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(payload, actorUserId)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('rejeita preço personalizado para empresa inexistente', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...payload, companyId: 'company-1' }, actorUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita preço personalizado quando a região da empresa está inativa', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        region: { id: 'region-2', active: false },
      });

      await expect(
        service.create({ ...payload, companyId: 'company-1' }, actorUserId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita quando o tipo de serviço não existe', async () => {
      prisma.serviceType.findUnique.mockResolvedValue(null);

      await expect(service.create(payload, actorUserId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita quando não há região configurada', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1' });
      prisma.region.findFirst.mockResolvedValue(null);

      await expect(service.create(payload, actorUserId)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('deactivate', () => {
    it('desativa uma tabela de preços ativa', async () => {
      tx.pricingTable.findUnique.mockResolvedValue({ id: 'pt-1', active: true });
      tx.pricingTable.update.mockResolvedValue({
        id: 'pt-1',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        companyId: null,
        company: null,
        baseFee: { toString: () => '5.00' },
        includedDistanceKm: { toString: () => '0.00' },
        perKmFee: { toString: () => '1.50' },
        minimumFee: null,
        returnFee: null,
        active: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.deactivate('pt-1', actorUserId);

      expect(result.active).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          action: 'PRICING_TABLE_DEACTIVATED',
          entityType: 'PRICING_TABLE',
          entityId: 'pt-1',
        }),
        tx,
      );
    });

    it('rejeita desativar uma tabela já inativa', async () => {
      tx.pricingTable.findUnique.mockResolvedValue({ id: 'pt-1', active: false });

      await expect(service.deactivate('pt-1', actorUserId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.pricingTable.update).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a tabela não existe', async () => {
      tx.pricingTable.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('inexistente', actorUserId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reactivate', () => {
    const inativa = {
      id: 'tabela-1',
      regionId: 'regiao-1',
      serviceTypeId: 'servico-1',
      companyId: null,
      active: false,
    };

    function tabelaPronta(extra: Record<string, unknown> = {}) {
      return {
        ...inativa,
        active: true,
        baseFee: 5,
        perKmFee: 1.5,
        minimumFee: 5,
        returnFee: 1,
        includedDistanceKm: 2,
        createdAt: new Date('2026-08-24T12:00:00Z'),
        serviceType: { id: 'servico-1', name: 'motoboy', code: 'MOTOBOY' },
        company: null,
        ...extra,
      };
    }

    it('volta a tabela para ativa', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue(inativa);
      tx.pricingTable.update.mockResolvedValue(tabelaPronta());

      const resultado = await service.reactivate('tabela-1', actorUserId);

      expect(resultado.active).toBe(true);
      expect(tx.pricingTable.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tabela-1' }, data: { active: true } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          action: 'PRICING_TABLE_REACTIVATED',
          entityType: 'PRICING_TABLE',
          entityId: 'tabela-1',
        }),
        tx,
      );
    });

    it('RECUSA se ja houver outra ativa no mesmo escopo, sem desativa-la', async () => {
      /**
       * A regra que justifica este metodo existir do jeito que existe. Trocar
       * qual tabela governa o preco e decisao de dinheiro: fazer isso como
       * efeito colateral de um clique em "Ativar" mudaria o preco de todo
       * pedido novo sem ninguem perceber.
       */
      prisma.pricingTable.findUnique.mockResolvedValue(inativa);
      tx.pricingTable.findFirst.mockResolvedValue({
        id: 'tabela-2',
        serviceType: { name: 'motoboy' },
      });

      await expect(service.reactivate('tabela-1', actorUserId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.pricingTable.update).not.toHaveBeenCalled();
      expect(tx.pricingTable.updateMany).not.toHaveBeenCalled();
    });

    it('procura a concorrente no MESMO escopo, incluindo a empresa', async () => {
      // Tabela de empresa nao conflita com a geral: sao escopos diferentes.
      prisma.pricingTable.findUnique.mockResolvedValue({ ...inativa, companyId: 'empresa-1' });
      tx.pricingTable.update.mockResolvedValue(tabelaPronta({ companyId: 'empresa-1' }));

      await service.reactivate('tabela-1', actorUserId);

      expect(tx.pricingTable.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            regionId: 'regiao-1',
            serviceTypeId: 'servico-1',
            companyId: 'empresa-1',
            active: true,
          },
        }),
      );
    });

    it('recusa reativar o que ja esta ativo', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue({ ...inativa, active: true });

      await expect(service.reactivate('tabela-1', actorUserId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('erra claro quando a tabela nao existe', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue(null);

      await expect(service.reactivate('sumiu', actorUserId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
