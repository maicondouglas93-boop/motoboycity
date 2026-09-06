import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_MANUAL_INVOICE_FILTERS as empty,
  MANUAL_INVOICE_SELECTION_LIMIT,
  filterManualInvoiceCandidates as filter,
  invoicePeriod,
  manualInvoiceFilterError,
  selectInvoiceResults,
  deselectInvoiceResults,
} from '../src/lib/manual-invoice-filters.ts';

const candidate = (
  id,
  displayNumber,
  completedAt,
  totalValue,
  serviceTypeName = 'Motoboy',
  externalOrderNumber = null,
) => ({
  id,
  displayNumber,
  completedAt,
  totalValue,
  serviceTypeName,
  externalOrderNumber,
  driverValue: 4,
  platformValue: 1,
});
const orders = [
  candidate('a', 432, '2026-09-01T02:59:59.999Z', 5.5),
  candidate('b', 445, '2026-09-01T03:00:00.000Z', 5.86, 'Carro', 'AIQ-1234'),
  candidate('c', 477, '2026-09-02T02:59:59.999Z', 6),
  candidate('d', 687, '2026-09-02T03:00:00.000Z', 12, 'Carro', 'LOJA-90'),
];

test('período inclusivo usa conclusão em São Paulo e não o dia UTC', () => {
  assert.deepEqual(
    filter(orders, { ...empty, from: '2026-09-01', to: '2026-09-01' }, []).map((o) => o.id),
    ['b', 'c'],
  );
  assert.deepEqual(
    filter(orders, { ...empty, to: '2026-08-31' }, []).map((o) => o.id),
    ['a'],
  );
  assert.deepEqual(
    filter(orders, { ...empty, from: '2026-09-02' }, []).map((o) => o.id),
    ['d'],
  );
});

test('busca aceita número exato, #, vários números e parcial de externo sem diferenciar caixa', () => {
  assert.deepEqual(
    filter(orders, { ...empty, search: '#432, 477; aiq-123' }, []).map((o) => o.id),
    ['a', 'b', 'c'],
  );
  assert.equal(filter(orders, { ...empty, search: '43' }, []).length, 0);
  assert.equal(filter(orders, { ...empty, search: 'NÃO EXISTE' }, []).length, 0);
});

test('modalidade, valor e período são combinados e aceitam vírgula ou ponto', () => {
  assert.deepEqual(
    filter(
      orders,
      { ...empty, serviceType: 'Carro', minValue: '5,86', maxValue: '6.00', from: '2026-09-01' },
      [],
    ).map((o) => o.id),
    ['b'],
  );
  assert.equal(filter(orders, { ...empty, minValue: '0', maxValue: '0' }, []).length, 0);
});

test('intervalos invertidos e valores inválidos não viram uma seleção ampla', () => {
  for (const patch of [
    { from: '2026-09-02', to: '2026-09-01' },
    { from: '2026-02-30' },
    { minValue: '12', maxValue: '5' },
    { minValue: '-1' },
    { maxValue: 'abc' },
    { minValue: '1.000,00' },
    { minValue: '1,234' },
  ]) {
    assert.ok(manualInvoiceFilterError({ ...empty, ...patch }));
    assert.deepEqual(filter(orders, { ...empty, ...patch }, []), []);
  }
});

test('atalhos usam dia operacional e cruzam mês, ano e fevereiro bissexto', () => {
  const now = new Date('2026-09-07T02:30:00Z'); // ainda domingo 06/09 na operação
  assert.deepEqual(invoicePeriod('today', now), { from: '2026-09-06', to: '2026-09-06' });
  assert.deepEqual(invoicePeriod('last7', now), { from: '2026-08-31', to: '2026-09-06' });
  assert.deepEqual(invoicePeriod('month', now), { from: '2026-09-01', to: '2026-09-06' });
  assert.deepEqual(invoicePeriod('yesterday', new Date('2026-01-01T12:00:00Z')), {
    from: '2025-12-31',
    to: '2025-12-31',
  });
  assert.deepEqual(invoicePeriod('previousMonth', new Date('2024-03-05T12:00:00Z')), {
    from: '2024-02-01',
    to: '2024-02-29',
  });
});

test('selecionar e desmarcar resultados preserva os pedidos fora do filtro e não duplica IDs', () => {
  assert.deepEqual(selectInvoiceResults(['a'], ['b', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(deselectInvoiceResults(['a', 'b', 'c'], ['b', 'c']), ['a']);
  assert.deepEqual(selectInvoiceResults(['a'], []), ['a']);
});

test('limite de 500 é aplicado sem seleção parcial ou silenciosa', () => {
  const selected = Array.from({ length: MANUAL_INVOICE_SELECTION_LIMIT }, (_, i) => String(i));
  assert.equal(selectInvoiceResults(selected, ['mais-um']), null);
  assert.deepEqual(selectInvoiceResults(selected, ['1']), selected);
  assert.equal(selectInvoiceResults([], [...selected, 'extra']), null);
});

test('ver selecionados e não selecionados mantém o escopo dos outros filtros', () => {
  assert.deepEqual(
    filter(orders, { ...empty, selection: 'selected' }, ['a', 'c']).map((o) => o.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    filter(orders, { ...empty, selection: 'unselected', serviceType: 'Carro' }, ['b']).map(
      (o) => o.id,
    ),
    ['d'],
  );
});

test('ordenar não altera a resposta cacheada da API', () => {
  assert.deepEqual(
    filter(orders, { ...empty, sort: 'valueDesc' }, []).map((o) => o.id),
    ['d', 'c', 'b', 'a'],
  );
  assert.deepEqual(
    filter(orders, { ...empty, sort: 'newest' }, []).map((o) => o.id),
    ['d', 'c', 'b', 'a'],
  );
  assert.deepEqual(
    orders.map((o) => o.id),
    ['a', 'b', 'c', 'd'],
  );
});
