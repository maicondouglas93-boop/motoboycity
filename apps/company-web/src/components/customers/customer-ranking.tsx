'use client';

import Link from 'next/link';
import type { CompanyCustomerRankingItem } from '@motoboycity/types';
import { ArrowUpRight, Crown, Medal, Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCustomerPhone } from '@/lib/company-customer';

interface Props {
  items: CompanyCustomerRankingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function completionRate(item: CompanyCustomerRankingItem): number {
  return item.totalDeliveries === 0
    ? 0
    : Math.round((item.completedDeliveries / item.totalDeliveries) * 100);
}

function lastDelivery(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Sem entrega concluída';
}

const podiumStyles = {
  1: {
    position: 'md:col-start-2 md:row-start-1',
    card: 'border-colete/65 bg-gradient-to-b from-colete/24 via-white/12 to-white/7 shadow-[0_24px_60px_-28px_rgba(253,160,46,0.95)]',
    avatar: 'border-colete bg-colete text-asfalto shadow-[0_12px_30px_-14px_rgba(253,160,46,0.95)]',
    badge: 'bg-colete text-asfalto',
  },
  2: {
    position: 'md:col-start-1 md:row-start-1 md:mt-8',
    card: 'border-white/25 bg-white/9',
    avatar: 'border-slate-200 bg-slate-100 text-slate-700',
    badge: 'bg-slate-100 text-slate-700',
  },
  3: {
    position: 'md:col-start-3 md:row-start-1 md:mt-12',
    card: 'border-[#d89b72]/55 bg-[#d89b72]/10',
    avatar: 'border-[#d89b72] bg-[#f1c4a5] text-[#5f321f]',
    badge: 'bg-[#f1c4a5] text-[#5f321f]',
  },
} as const;

function PodiumCustomer({ item, rank }: { item: CompanyCustomerRankingItem; rank: 1 | 2 | 3 }) {
  const style = podiumStyles[rank];
  return (
    <Link
      href={`/clientes/${item.id}`}
      aria-label={`${rank}º lugar: ${item.name}, ${item.completedDeliveries} entregas concluídas`}
      className={`group relative self-end rounded-3xl border p-4 text-center backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-white/45 focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none ${style.position} ${style.card}`}
    >
      <span
        className={`absolute top-3 left-3 inline-flex min-w-9 items-center justify-center rounded-full px-2 py-1 font-mono text-xs font-black ${style.badge}`}
      >
        {rank}º
      </span>
      {rank === 1 ? (
        <Crown className="mx-auto mb-1 size-7 fill-colete text-colete" aria-hidden="true" />
      ) : (
        <Medal className="mx-auto mb-1 size-6 text-white/65" aria-hidden="true" />
      )}
      <span
        className={`mx-auto grid size-16 place-items-center rounded-2xl border-2 font-heading text-xl font-black ${style.avatar}`}
        aria-hidden="true"
      >
        {initials(item.name)}
      </span>
      <strong className="mt-3 block truncate font-heading text-base text-white">{item.name}</strong>
      <span className="mt-1 block text-xs text-white/58">{formatCustomerPhone(item.phone)}</span>
      <span className="mt-4 block font-heading text-3xl font-black tracking-tight text-white">
        {item.completedDeliveries}
      </span>
      <span className="block text-[11px] font-semibold tracking-[0.08em] text-white/60 uppercase">
        entregas concluídas
      </span>
      <span className="mt-3 inline-flex rounded-full border border-white/12 bg-black/12 px-2.5 py-1 text-[11px] text-white/70">
        {completionRate(item)}% de conclusão
      </span>
      <ArrowUpRight
        className="absolute right-3 bottom-3 size-4 text-white/35 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
        aria-hidden="true"
      />
    </Link>
  );
}

export function CustomerRanking({ items, isLoading, isError, onRetry }: Props) {
  const podium = items.slice(0, 3);
  const remaining = items.slice(3);

  return (
    <section
      aria-labelledby="customer-ranking-title"
      className="premium-panel relative isolate overflow-hidden rounded-[2rem] border border-portal/20 bg-asfalto px-4 py-6 text-white sm:px-6 lg:px-8"
    >
      <div
        className="pointer-events-none absolute -top-32 -right-24 -z-10 size-80 rounded-full bg-colete/14 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-20 -z-10 size-96 rounded-full bg-[#35b8b2]/16 blur-3xl"
        aria-hidden="true"
      />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-colete/35 bg-colete/14 text-colete shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <Trophy className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-colete uppercase">
              <Sparkles className="size-3" aria-hidden="true" /> Destaques da casa
            </p>
            <h2 id="customer-ranking-title" className="mt-1 font-heading text-2xl font-black text-white">
              Melhores clientes
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/58">
              Ranking por entregas concluídas. Empates priorizam quem pediu mais recentemente.
            </p>
          </div>
        </div>
        {!isLoading && !isError && items.length > 0 && (
          <span className="rounded-full border border-white/12 bg-white/7 px-3 py-1.5 text-xs font-semibold text-white/70">
            Top {items.length}
          </span>
        )}
      </header>

      {isLoading && (
        <div className="mt-8 grid animate-pulse gap-3 md:grid-cols-3" aria-label="Carregando ranking">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-56 rounded-3xl border border-white/10 bg-white/7" />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-7 rounded-2xl border border-white/12 bg-white/7 p-5 text-sm text-white/70">
          <p>Não foi possível carregar o ranking agora.</p>
          <Button type="button" size="sm" className="mt-3" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="mt-7 rounded-2xl border border-dashed border-white/18 bg-white/5 px-5 py-9 text-center">
          <Trophy className="mx-auto size-7 text-white/35" aria-hidden="true" />
          <p className="mt-3 font-semibold text-white">O pódio começa na primeira entrega</p>
          <p className="mt-1 text-sm text-white/55">
            Os clientes aparecerão aqui assim que tiverem pedidos vinculados ao cadastro.
          </p>
        </div>
      )}

      {!isLoading && !isError && podium.length > 0 && (
        <div className="mt-10 grid items-end gap-3 md:grid-cols-3">
          {podium.map((item, index) => (
            <PodiumCustomer key={item.id} item={item} rank={(index + 1) as 1 | 2 | 3} />
          ))}
        </div>
      )}

      {!isLoading && !isError && remaining.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-bold text-white">Ranking completo</h3>
            <span className="text-[11px] text-white/45">Atualizado com o histórico da empresa</span>
          </div>
          <ol className="grid gap-2 lg:grid-cols-2">
            {remaining.map((item, index) => {
              const rank = index + 4;
              return (
                <li key={item.id}>
                  <Link
                    href={`/clientes/${item.id}`}
                    aria-label={`${rank}º lugar: ${item.name}`}
                    className="group flex items-center gap-3 rounded-2xl border border-white/9 bg-white/5 p-3 transition-all hover:border-white/20 hover:bg-white/9 focus-visible:ring-2 focus-visible:ring-colete focus-visible:outline-none"
                  >
                    <span className="w-8 shrink-0 text-center font-mono text-sm font-black text-white/45">
                      {rank}º
                    </span>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/9 font-heading text-xs font-black text-white">
                      {initials(item.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-white">{item.name}</strong>
                      <span className="block truncate text-[11px] text-white/45">
                        Última entrega: {lastDelivery(item.lastDeliveryAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <strong className="block font-heading text-lg text-white">
                        {item.completedDeliveries}
                      </strong>
                      <span className="block text-[10px] text-white/45">concluídas</span>
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-white/25 transition-colors group-hover:text-colete"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
