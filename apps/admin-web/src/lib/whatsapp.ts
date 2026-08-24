export interface InvoiceWhatsAppMessageInput {
  companyName: string;
  invoiceNumber: string;
  totalValue: number;
  dueDate: string;
  deliveryCount: number;
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function civilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Aceita telefone nacional (10/11 dígitos) ou E.164 brasileiro já prefixado. */
export function normalizeBrazilWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  const national =
    (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
      ? digits.slice(2)
      : digits;
  if (!/^[1-9]\d{9,10}$/.test(national)) return null;
  return `55${national}`;
}

export function buildInvoiceWhatsAppMessage(input: InvoiceWhatsAppMessageInput): string {
  return [
    'Olá!',
    '',
    `Segue o resumo da fatura ${input.invoiceNumber} da ${input.companyName}:`,
    `Valor: ${money.format(input.totalValue)}`,
    `Vencimento: ${civilDate(input.dueDate)}`,
    `Pedidos incluídos: ${input.deliveryCount}`,
    '',
    'Se precisar, estamos à disposição.',
  ].join('\n');
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const number = normalizeBrazilWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
