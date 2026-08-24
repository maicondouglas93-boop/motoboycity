import Link from 'next/link';
import {
  ArrowRight,
  Bike,
  Clock3,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  TimerReset,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ReportLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: string;
};

type ReportGroup = {
  title: string;
  description: string;
  reports: ReportLink[];
};

/**
 * A central só anuncia destinos completos. Novos cards entram junto com sua
 * página e seu contrato real, nunca como promessa clicável para uma tela vazia.
 */
const reportGroups: ReportGroup[] = [
  {
    title: 'Visão geral',
    description: 'Acompanhe volume, conclusão, custos e evolução da sua operação em um só lugar.',
    reports: [
      {
        title: 'Analítico geral',
        description:
          'Indicadores consolidados, comparação com o período anterior, status e evolução diária.',
        href: '/relatorios/geral',
        icon: LayoutDashboard,
        tone: 'bg-violet-500/10 text-violet-700 ring-violet-500/15',
      },
      {
        title: 'Horários e demanda',
        description:
          'Volume por hora, faixa do dia e dia da semana, normalizado pelo calendário local.',
        href: '/relatorios/horarios',
        icon: Clock3,
        tone: 'bg-indigo-500/10 text-indigo-700 ring-indigo-500/15',
      },
    ],
  },
  {
    title: 'Pedidos e custos',
    description: 'Localize cada pedido e acompanhe o custo conhecido da sua operação.',
    reports: [
      {
        title: 'Histórico de pedidos',
        description:
          'Busca por pedido, filtros de período e status, paginação real e acesso ao detalhe.',
        href: '/relatorios/pedidos',
        icon: ListChecks,
        tone: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/15',
      },
      {
        title: 'Modalidades e custos',
        description:
          'Participação em volume e custo, ticket médio, retorno e conferência de preços.',
        href: '/relatorios/modalidades',
        icon: Bike,
        tone: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15',
      },
    ],
  },
  {
    title: 'Qualidade da operação',
    description: 'Encontre gargalos no aceite, na coleta e no percurso até o cliente.',
    reports: [
      {
        title: 'Tempos e SLA',
        description:
          'Média, mediana, p90, amostras e comparação com a janela imediatamente anterior.',
        href: '/relatorios/tempos-sla',
        icon: TimerReset,
        tone: 'bg-orange-500/10 text-orange-700 ring-orange-500/15',
      },
    ],
  },
];

function ReportCard({ report }: { report: ReportLink }) {
  const Icon = report.icon;

  return (
    <Link
      href={report.href}
      className="group flex min-h-32 items-center gap-4 rounded-2xl border border-border/75 bg-card/90 p-5 shadow-[0_1px_2px_rgba(16,37,47,0.05),0_14px_30px_-26px_rgba(15,107,112,0.65)] ring-1 ring-white/70 transition-all hover:-translate-y-0.5 hover:border-portal/25 hover:shadow-[0_10px_28px_-20px_rgba(15,107,112,0.45)] focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
    >
      <span
        className={`grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${report.tone}`}
      >
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-base leading-5 font-semibold text-portal-deep">
          {report.title}
        </span>
        <span className="mt-1.5 block text-sm leading-5 text-muted-foreground">
          {report.description}
        </span>
      </span>
      <ArrowRight
        className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-portal"
        aria-hidden="true"
      />
    </Link>
  );
}

export default function ReportsHubPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-9 pb-12">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-portal-deep">
            Central de relatórios
          </h1>
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Somente dados da sua empresa
          </Badge>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Escolha uma análise para entender seus pedidos e os tempos da operação. Todos os
          relatórios disponíveis consultam a API real e respeitam a empresa vinculada ao seu acesso.
        </p>
      </header>

      {reportGroups.map((group) => (
        <section key={group.title} className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-portal-deep">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.reports.map((report) => (
              <ReportCard key={report.title} report={report} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
