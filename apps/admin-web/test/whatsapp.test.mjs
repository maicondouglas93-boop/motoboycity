import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInvoiceWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeBrazilWhatsAppNumber,
} from '../src/lib/whatsapp.ts';

test('normaliza telefones brasileiros nacionais e E.164', () => {
  assert.equal(normalizeBrazilWhatsAppNumber('(33) 99999-8877'), '5533999998877');
  assert.equal(normalizeBrazilWhatsAppNumber('(33) 3333-2211'), '553333332211');
  assert.equal(normalizeBrazilWhatsAppNumber('+55 33 99999-8877'), '5533999998877');
  assert.equal(normalizeBrazilWhatsAppNumber('00000000000'), null);
  assert.equal(normalizeBrazilWhatsAppNumber('123'), null);
});

test('monta mensagem de fatura sem expor dados pessoais ou token', () => {
  const message = buildInvoiceWhatsAppMessage({
    companyName: 'Loja Central',
    invoiceNumber: 'FAT-2026-08',
    totalValue: 1234.56,
    dueDate: '2026-08-24',
    deliveryCount: 12,
  });

  assert.match(message, /FAT-2026-08/);
  assert.match(message, /R\$\s*1\.234,56/);
  assert.match(message, /24\/08\/2026/);
  assert.doesNotMatch(message, /Maria|João/i);
  assert.doesNotMatch(message, /token|CPF|CNPJ/i);
});

test('codifica acentos, e comercial e quebras de linha na URL', () => {
  const message = 'Olá, Maria & João.\nFatura pronta.';
  const url = buildWhatsAppUrl('(33) 99999-8877', message);

  assert.equal(url, `https://wa.me/5533999998877?text=${encodeURIComponent(message)}`);
});
