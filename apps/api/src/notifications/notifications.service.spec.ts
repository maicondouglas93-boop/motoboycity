import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { InvoiceService } from '../finance/invoice.service';
import { AdminNotificationsService } from './admin-notifications.service';
import { JobCheckInService } from './job-check-in.service';
import { CompanyNotificationsService } from './company-notifications.service';

const companyUser = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;

function semNada() {
  return {
    companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: 'company-a' }) },
    invoice: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { totalValue: null } }),
      count: jest.fn().mockResolvedValue(0),
    },
    invoicePaymentNotice: { count: jest.fn().mockResolvedValue(0) },
    delivery: { count: jest.fn().mockResolvedValue(0) },
    companyAddress: { findFirst: jest.fn().mockResolvedValue({ lat: -20.15, lng: -41.62 }) },
    company: { count: jest.fn().mockResolvedValue(0) },
    driver: { count: jest.fn().mockResolvedValue(0) },
  };
}

const configuracaoCompleta = {
  dispatchOfferTimeoutSeconds: 60,
  driverCommissionPercentage: 80,
};

describe('central de avisos', () => {
  let prisma: ReturnType<typeof semNada>;
  let invoiceService: { refreshOverdueInvoices: jest.Mock };
  let platformSettings: { get: jest.Mock };
  let jobCheckIn: { ultimoAviso: jest.Mock };

  async function montarEmpresa() {
    const module = await Test.createTestingModule({
      providers: [
        CompanyNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
      ],
    }).compile();
    return module.get(CompanyNotificationsService);
  }

  async function montarAdmin() {
    const module = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: AdminPlatformSettingsService, useValue: platformSettings },
        { provide: JobCheckInService, useValue: jobCheckIn },
      ],
    }).compile();
    return module.get(AdminNotificationsService);
  }

  beforeEach(() => {
    prisma = semNada();
    invoiceService = { refreshOverdueInvoices: jest.fn().mockResolvedValue(undefined) };
    platformSettings = { get: jest.fn().mockResolvedValue(configuracaoCompleta) };
    // Padrao: o backup avisou ha pouco. Os testes de atraso sobrescrevem.
    jobCheckIn = {
      ultimoAviso: jest.fn().mockResolvedValue({ lastRunAt: new Date(), detail: null }),
    };
  });

  describe('empresa', () => {
    it('nao inventa aviso quando esta tudo em ordem', async () => {
      const service = await montarEmpresa();

      await expect(service.list(companyUser)).resolves.toEqual({ items: [], criticalCount: 0 });
    });

    /**
     * Atualizar o vencimento ANTES de contar: sem isto, a fatura que venceu
     * hoje ainda apareceria como "a vencer" — justamente no dia em que a loja
     * precisa agir.
     */
    it('atualiza o vencimento das faturas antes de contar', async () => {
      const service = await montarEmpresa();

      await service.list(companyUser);

      expect(invoiceService.refreshOverdueInvoices).toHaveBeenCalledTimes(1);
    });

    it('fatura vencida e critica e leva para as faturas', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { totalValue: 480.5 },
      });
      const service = await montarEmpresa();

      const resultado = await service.list(companyUser);

      expect(resultado.criticalCount).toBe(1);
      const aviso = resultado.items.find((item) => item.id === 'company:invoices:overdue');
      expect(aviso).toMatchObject({ severity: 'critical', href: '/faturas' });
      expect(aviso?.title).toContain('2 faturas vencidas');
      expect(aviso?.description).toContain('480,50');
    });

    it('usa o singular quando e uma so', async () => {
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { totalValue: 100 },
      });
      const service = await montarEmpresa();

      const { items } = await service.list(companyUser);

      expect(items[0]?.title).toContain('1 fatura vencida');
    });

    /**
     * A loja fez a parte dela e o dinheiro continua em aberto. Sem este aviso
     * ela acha que avisou e espera, enquanto a fatura corre para o vencimento.
     */
    it('avisa quando a administracao recusou um aviso de pagamento', async () => {
      prisma.invoicePaymentNotice.count.mockResolvedValue(1);
      const service = await montarEmpresa();

      const { items } = await service.list(companyUser);

      expect(items.map((item) => item.id)).toContain('company:payment-notice:rejected');
    });

    it('avisa o endereco de coleta sem coordenada', async () => {
      prisma.companyAddress.findFirst.mockResolvedValue({ lat: null, lng: null });
      const service = await montarEmpresa();

      const { items } = await service.list(companyUser);

      expect(items.map((item) => item.id)).toContain('company:address:missing-coordinates');
    });

    it('nao vaza avisos para quem nao esta vinculado a uma empresa', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue(null);
      const service = await montarEmpresa();

      await expect(service.list(companyUser)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('admin', () => {
    it('nao inventa aviso quando esta tudo em ordem', async () => {
      const service = await montarAdmin();

      await expect(service.list()).resolves.toEqual({ items: [], criticalCount: 0 });
    });

    /**
     * As duas configuracoes que param a plataforma inteira. Nada estoura quando
     * elas faltam: pedidos simplesmente param de andar, e a falha aparece longe
     * da causa — motoboy online sem receber nada, loja sem entender.
     */
    it('trata configuracao ausente como critica e aponta a tela que resolve', async () => {
      platformSettings.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: null,
        driverCommissionPercentage: null,
      });
      const service = await montarAdmin();

      const resultado = await service.list();

      expect(resultado.criticalCount).toBe(2);
      expect(resultado.items.every((item) => item.href === '/configuracoes/operacao')).toBe(true);
      expect(resultado.items.map((item) => item.id)).toEqual([
        'admin:settings:dispatch-timeout',
        'admin:settings:driver-commission',
      ]);
    });

    /**
     * A ausencia do aviso e o sinal. Perguntar ao GitHub se o workflow falhou
     * so detecta a falha que ele consegue reportar; se a rotina for apagada ou
     * nunca agendar, o silencio parece sucesso.
     */
    it('avisa quando o backup para de dar sinal', async () => {
      const quarentaHorasAtras = new Date(Date.now() - 40 * 3_600_000);
      jobCheckIn.ultimoAviso.mockResolvedValue({ lastRunAt: quarentaHorasAtras, detail: null });
      const service = await montarAdmin();

      const { items } = await service.list();

      const aviso = items.find((item) => item.id === 'admin:backup:stale');
      expect(aviso).toMatchObject({ severity: 'warning' });
      expect(aviso?.description).toContain('40 horas');
    });

    it('nao reclama de um backup que rodou hoje', async () => {
      const service = await montarAdmin();

      const { items } = await service.list();

      expect(items.map((item) => item.id)).not.toContain('admin:backup:stale');
    });

    /**
     * Um dia sem backup e problema, mas nao para a operacao hoje. Uma semana
     * significa que ninguem olhou, e a unica rede de protecao dos dados nao
     * existe mais.
     */
    it('vira critico depois de uma semana sem sinal', async () => {
      jobCheckIn.ultimoAviso.mockResolvedValue({
        lastRunAt: new Date(Date.now() - 8 * 24 * 3_600_000),
        detail: null,
      });
      const service = await montarAdmin();

      const { items, criticalCount } = await service.list();

      const aviso = items.find((item) => item.id === 'admin:backup:stale');
      expect(aviso?.severity).toBe('critical');
      // Dia, e nao "192 horas": aqui a gravidade precisa ser obvia de bater o
      // olho, sem a pessoa dividir de cabeca.
      expect(aviso?.description).toContain('8 dias');
      expect(criticalCount).toBe(1);
    });

    it('trata "nunca avisou" como pendente, e nao como tudo em ordem', async () => {
      jobCheckIn.ultimoAviso.mockResolvedValue(null);
      const service = await montarAdmin();

      const { items } = await service.list();

      const aviso = items.find((item) => item.id === 'admin:backup:stale');
      expect(aviso?.title).toContain('nunca confirmou');
      expect(aviso?.severity).toBe('critical');
    });

    it('conta empresas e entregadores esperando aprovacao', async () => {
      prisma.company.count.mockResolvedValue(2);
      prisma.driver.count.mockResolvedValue(3);
      const service = await montarAdmin();

      const { items } = await service.list();

      expect(items.find((item) => item.id === 'admin:companies:pending-approval')).toMatchObject({
        href: '/clientes',
      });
      expect(items.find((item) => item.id === 'admin:drivers:pending-approval')?.title).toContain(
        '3 entregadores',
      );
    });

    /**
     * O critico vem antes: se tudo tiver o mesmo peso, o sino deixa de informar
     * qual e o problema que para a operacao.
     */
    it('coloca o que para a operacao antes do que so precisa de atencao', async () => {
      platformSettings.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: null,
        driverCommissionPercentage: 80,
      });
      prisma.company.count.mockResolvedValue(1);
      const service = await montarAdmin();

      const { items } = await service.list();

      expect(items[0]?.severity).toBe('critical');
      expect(items[items.length - 1]?.severity).toBe('warning');
    });
  });
});
