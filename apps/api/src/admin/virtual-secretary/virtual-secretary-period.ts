import { BadRequestException } from '@nestjs/common';
import { dateInSaoPaulo } from '../../common/sao-paulo-time';

export const VIRTUAL_SECRETARY_PERIODS = [
  'TODAY',
  'YESTERDAY',
  'THIS_WEEK',
  'LAST_WEEK',
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'CUSTOM',
] as const;

export type VirtualSecretaryPeriod = (typeof VIRTUAL_SECRETARY_PERIODS)[number];

function shift(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function previousMonth(date: string): { first: string; last: string } {
  const [year, month] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year!, month! - 2, 1));
  const last = new Date(Date.UTC(year!, month! - 1, 0));
  return { first: first.toISOString().slice(0, 10), last: last.toISOString().slice(0, 10) };
}

export function resolveVirtualSecretaryPeriod(
  period: VirtualSecretaryPeriod,
  custom?: { from?: string; to?: string },
  now = new Date(),
): { from: string; to: string; label: string } {
  const today = dateInSaoPaulo(now);
  switch (period) {
    case 'TODAY':
      return { from: today, to: today, label: 'hoje' };
    case 'YESTERDAY': {
      const yesterday = shift(today, -1);
      return { from: yesterday, to: yesterday, label: 'ontem' };
    }
    case 'THIS_WEEK': {
      const daysSinceMonday = (weekday(today) + 6) % 7;
      return { from: shift(today, -daysSinceMonday), to: today, label: 'esta semana' };
    }
    case 'LAST_WEEK': {
      const daysSinceMonday = (weekday(today) + 6) % 7;
      const thisMonday = shift(today, -daysSinceMonday);
      return {
        from: shift(thisMonday, -7),
        to: shift(thisMonday, -1),
        label: 'semana passada',
      };
    }
    case 'THIS_MONTH':
      return { from: firstOfMonth(today), to: today, label: 'este mês' };
    case 'LAST_MONTH': {
      const previous = previousMonth(today);
      return { from: previous.first, to: previous.last, label: 'mês passado' };
    }
    case 'LAST_7_DAYS':
      return { from: shift(today, -6), to: today, label: 'últimos 7 dias' };
    case 'LAST_30_DAYS':
      return { from: shift(today, -29), to: today, label: 'últimos 30 dias' };
    case 'CUSTOM':
      if (!custom?.from || !custom.to || custom.from > custom.to) {
        throw new BadRequestException('O período personalizado informado é inválido.');
      }
      return { from: custom.from, to: custom.to, label: `${custom.from} a ${custom.to}` };
  }
}
