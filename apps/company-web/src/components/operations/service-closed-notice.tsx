'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, MoonStar } from 'lucide-react';
import { companyBusinessHoursApi } from '@/lib/api-client';

/**
 * O aviso de que a operação está fechada agora.
 *
 * Sem ele, a loja descobre o horário do pior jeito possível: digita o pedido
 * inteiro, clica em enviar e leva uma recusa. O aviso troca esse erro por uma
 * informação dada antes — e diz **quando abre**, que é a única coisa que
 * transforma "não dá" em "volto às oito".
 *
 * Quem decide é a API (`GET /company/business-hours`), com a mesma regra que
 * bloqueia a criação. Recalcular o horário aqui no navegador criaria uma
 * segunda cópia dessa regra, e a primeira divergência apareceria como a tela
 * dizendo "aberto" numa hora em que o envio volta erro.
 */
export function useServiceHours(token: string | null) {
  return useQuery({
    queryKey: ['company', 'business-hours'],
    queryFn: () => companyBusinessHoursApi.status(token as string),
    enabled: Boolean(token),
    /**
     * Um minuto. O horário vira na marca do minuto, e um aviso que só some
     * quando a pessoa recarrega a página faria a loja achar que continua
     * fechado depois de abrir.
     */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function faixaLegivel(minuto: number): string {
  const hora = String(Math.floor(minuto / 60) % 24).padStart(2, '0');
  return `${hora}:${String(minuto % 60).padStart(2, '0')}`;
}

export function ServiceClosedNotice({
  token,
  className,
}: {
  token: string | null;
  className?: string;
}) {
  const { data } = useServiceHours(token);

  // Enquanto não sabe, não afirma nada: um aviso de "fechado" que pisca na
  // carga da página assusta à toa.
  if (!data || data.accepting) return null;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-portal/25 bg-portal-soft/70 px-4 py-3 text-sm text-portal-deep shadow-sm ${className ?? ''}`}
    >
      <MoonStar className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">Atendimento fechado agora.</span>
      <span>
        {data.nextOpeningLabel
          ? `Reabre ${data.nextOpeningLabel}.`
          : 'Nenhum horário de reabertura configurado.'}
      </span>
      {data.todayWindows.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-portal-deep/75">
          <Clock className="size-3.5" aria-hidden="true" />
          Hoje:{' '}
          {data.todayWindows
            .map(
              (janela) => `${faixaLegivel(janela.startMinute)}–${faixaLegivel(janela.endMinute)}`,
            )
            .join(', ')}
        </span>
      )}
    </div>
  );
}
