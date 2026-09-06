import assert from 'node:assert/strict';
import test from 'node:test';
import { filterInvoiceHistory, summarizeInvoiceHistory } from '../src/lib/invoice-history.ts';
import { formatarData } from '../src/lib/dinheiro.ts';

const filters = { status: 'ALL', from: '', to: '', number: '' };
const invoices = [
  { number: 'FAT-20260906-001', status: 'PENDING', issueDate: '2026-09-06', totalValue: 0.1 },
  { number: 'FAT-20260905-002', status: 'PAID', issueDate: '2026-09-05', totalValue: 0.2 },
  { number: 'FAT-20260904-003', status: 'OVERDUE', issueDate: '2026-09-04', totalValue: 10.5 },
  { number: 'FAT-20260903-004', status: 'CANCELLED', issueDate: '2026-09-03', totalValue: 999 },
];

test('canceladas permanecem no histórico sem inflar faturamento ou cobrança', () => {
  assert.deepEqual(filterInvoiceHistory(invoices, filters), invoices);
  assert.deepEqual(summarizeInvoiceHistory(invoices), {
    count: 4,
    billed: 10.8,
    paid: 0.2,
    paidCount: 1,
    outstanding: 10.6,
    outstandingCount: 2,
    overdue: 10.5,
    overdueCount: 1,
    cancelledCount: 1,
  });
});

test('período de emissão inclui os dois limites e mantém ordem da API', () => {
  assert.deepEqual(
    filterInvoiceHistory(invoices, { ...filters, from: '2026-09-04', to: '2026-09-05' }),
    invoices.slice(1, 3),
  );
  assert.deepEqual(
    filterInvoiceHistory(invoices, { ...filters, from: '2026-09-05', to: '2026-09-05' }),
    [invoices[1]],
  );
});

test('busca por número combina com status e período, ignorando caixa e espaços externos', () => {
  assert.deepEqual(
    filterInvoiceHistory(invoices, {
      ...filters,
      status: 'PAID',
      number: ' fat-20260905 ',
      from: '2026-09-01',
    }),
    [invoices[1]],
  );
  assert.deepEqual(
    filterInvoiceHistory(invoices, { ...filters, status: 'PAID', number: '003' }),
    [],
  );
});

test('filtro só de canceladas apresenta valores cobrados zerados', () => {
  const summary = summarizeInvoiceHistory(
    filterInvoiceHistory(invoices, { ...filters, status: 'CANCELLED' }),
  );
  assert.equal(summary.count, 1);
  assert.equal(summary.billed, 0);
  assert.equal(summary.paid, 0);
  assert.equal(summary.outstanding, 0);
});

test('lista vazia e soma de centavos não geram valores incorretos', () => {
  assert.equal(summarizeInvoiceHistory([]).billed, 0);
  assert.equal(summarizeInvoiceHistory(invoices.slice(0, 2)).billed, 0.3);
});

test('datas civis de emissão, vencimento e pagamento não voltam para o dia anterior', () => {
  assert.equal(formatarData('2026-09-06'), '06/09/2026');
  assert.equal(formatarData('2026-09-01'), '01/09/2026');
  assert.equal(formatarData(null), '—');
});
