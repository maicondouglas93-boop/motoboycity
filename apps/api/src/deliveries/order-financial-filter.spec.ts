import { GUARDS_METADATA } from '@nestjs/common/constants';
import { adminOrderReportQuerySchema } from '@motoboycity/validation';
import { AdminDeliveriesController } from '../admin/deliveries/admin-deliveries.controller';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { orderFinancialStatus, orderFinancialWhere } from './order-financial-filter';

const today = new Date('2026-09-06T00:00:00Z');
const invoice = { status: 'PENDING' as const, dueDate: today };
const completed = { status: 'COMPLETED' as const, paymentMethod: 'BILLED' as const, invoice };

describe('consulta financeira dos pedidos', () => {
  it('mantém o endpoint restrito a JWT e administrador', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminDeliveriesController)).toEqual([
      JwtAuthGuard,
      AdminOnlyGuard,
    ]);
  });
  it('valida datas reais, intervalo, status, empresa e paginação', () => {
    expect(adminOrderReportQuerySchema.parse({})).toMatchObject({
      financialStatus: 'ALL',
      dateField: 'CREATED',
      page: 1,
      pageSize: 25,
    });
    for (const input of [
      { from: '2026-02-30' },
      { to: '2026-13-01' },
      { from: '2026-09-06', to: '2026-09-01' },
      { companyId: 'invalid' },
      { financialStatus: 'COLLECTED' },
      { status: 'OPEN' },
      { dateField: 'PAYMENT' },
      { page: 0 },
      { pageSize: 101 },
    ])
      expect(adminOrderReportQuerySchema.safeParse(input).success).toBe(false);
    expect(
      adminOrderReportQuerySchema.safeParse({ from: '2024-02-29', to: '2024-02-29' }).success,
    ).toBe(true);
  });
  it('em aberto exige concluído, faturado, sem fatura ou fatura não paga', () => {
    expect(orderFinancialWhere('OPEN', today)).toEqual({
      status: 'COMPLETED',
      paymentMethod: 'BILLED',
      OR: [{ invoiceId: null }, { invoice: { status: { in: ['PENDING', 'OVERDUE'] } } }],
    });
    expect(orderFinancialWhere('ALL', today)).toEqual({});
    expect(orderFinancialWhere('UNBILLED', today)).toEqual({
      status: 'COMPLETED',
      paymentMethod: 'BILLED',
      invoiceId: null,
    });
    expect(orderFinancialWhere('PAID', today)).toEqual({
      status: 'COMPLETED',
      paymentMethod: 'BILLED',
      invoice: { status: 'PAID' },
    });
  });
  it('vencimento hoje é pendente, ontem vencido mesmo antes do job; consulta não grava nada', () => {
    expect(orderFinancialStatus(completed, today)).toBe('PENDING');
    expect(
      orderFinancialStatus(
        { ...completed, invoice: { ...invoice, dueDate: new Date('2026-09-05T00:00Z') } },
        today,
      ),
    ).toBe('OVERDUE');
    expect(orderFinancialWhere('PENDING', today)).toMatchObject({
      invoice: { status: 'PENDING', dueDate: { gte: today } },
    });
    expect(orderFinancialWhere('OVERDUE', today)).toMatchObject({
      invoice: { OR: [{ status: 'OVERDUE' }, { status: 'PENDING', dueDate: { lt: today } }] },
    });
  });
  it('não transforma pagamento do destinatário, online, cancelados ou andamento em dívida/pagamento de fatura', () => {
    expect(orderFinancialStatus({ ...completed, invoice: null }, today)).toBe('UNBILLED');
    expect(orderFinancialStatus({ ...completed, status: 'COLLECTED', invoice: null }, today)).toBe(
      'NOT_READY',
    );
    expect(orderFinancialStatus({ ...completed, status: 'CANCELLED', invoice: null }, today)).toBe(
      'CANCELLED',
    );
    expect(
      orderFinancialStatus({ ...completed, paymentMethod: 'ONLINE', invoice: null }, today),
    ).toBe('NOT_APPLICABLE');
    expect(
      orderFinancialStatus({ ...completed, invoice: { ...invoice, status: 'PAID' } }, today),
    ).toBe('PAID');
    expect(
      orderFinancialStatus({ ...completed, invoice: { ...invoice, status: 'CANCELLED' } }, today),
    ).toBe('INVOICE_CANCELLED');
  });
});
