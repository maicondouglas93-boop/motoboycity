'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@motoboycity/api-client';
import { useQuery } from '@tanstack/react-query';
import { companyReportsApi } from '@/lib/api-client';
import {
  defaultReportPeriod,
  isReportDate,
  previousComparablePeriod,
} from '@/lib/report-period';
import { session } from '@/lib/session';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function periodDays(from: string, to: string): number {
  return (
    Math.floor(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_IN_MS,
    ) + 1
  );
}

export function useCompanyOperationsReport(reportKey: string) {
  const token = session.getToken();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPeriod = useMemo(() => defaultReportPeriod(), []);
  const applied = useMemo(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return {
      from: isReportDate(from) ? from : defaultPeriod.from,
      to: isReportDate(to) ? to : defaultPeriod.to,
    };
  }, [defaultPeriod, searchParams]);
  const [from, setFrom] = useState(applied.from);
  const [to, setTo] = useState(applied.to);
  const [filterError, setFilterError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['company', 'reports', reportKey, applied],
    queryFn: () => companyReportsApi.operations(token as string, applied),
    enabled: Boolean(token),
  });

  function navigate(period: { from: string; to: string }, extras = new URLSearchParams()) {
    const params = new URLSearchParams(extras);
    params.set('from', period.from);
    params.set('to', period.to);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function applyFilters(extras = new URLSearchParams()) {
    if (!isReportDate(from) || !isReportDate(to)) {
      setFilterError('Informe as duas datas do período.');
      return;
    }
    if (from > to) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    if (periodDays(from, to) > 366) {
      setFilterError('Escolha um período de até 366 dias.');
      return;
    }
    setFilterError(null);
    navigate({ from, to }, extras);
  }

  function clearFilters() {
    const period = defaultReportPeriod();
    setFrom(period.from);
    setTo(period.to);
    setFilterError(null);
    navigate(period);
  }

  const errorMessage = query.error
    ? query.error instanceof ApiError
      ? query.error.message
      : 'Não foi possível calcular o relatório. Tente novamente.'
    : null;

  return {
    token,
    applied,
    comparisonPeriod: query.data?.comparison.period ?? previousComparablePeriod(applied),
    from,
    setFrom,
    to,
    setTo,
    filterError,
    query,
    errorMessage,
    applyFilters,
    clearFilters,
  };
}
