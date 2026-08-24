import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  Clock3,
  Layers3,
  ListChecks,
  ShieldCheck,
  TimerReset,
  Trophy,
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

const reportGroups: ReportGroup[] = [
  {
    title: 'Visão geral',
    description: 'Comece pelos indicadores que resumem o comportamento da operação.',
    reports: [
      {
        title: 'Analítico geral',
        description:
          'Volume criado, entregas concluídas, ticket médio e comparação entre períodos.',
        href: '/relatorios/geral',
        icon: BarChart3,
        tone: 'bg-sky-500/10 text-sky-600 ring-sky-500/15',
      },
      {
        title: 'Horários de pico',
        description: 'Pedidos por hora e dia da semana para dimensionar a operação.',
        href: '/relatorios/horarios-pico',
        icon: Clock3,
        tone: 'bg-orange-500/10 text-orange-600 ring-orange-500/15',
      },
    ],
  },
  {
    title: 'Pedidos e clientes',
    description: 'Entenda onde está o volume e quais clientes movimentam a operação.',
    reports: [
      {
        title: 'Consulta de pedidos',
        description: 'Busca detalhada com filtros, paginação e acesso a cada pedido.',
        href: '/relatorios/pedidos',
        icon: ListChecks,
        tone: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/15',
      },
      {
        title: 'Desempenho por cliente',
        description: 'Criados, concluídos, hoje cancelados e valores por empresa.',
        href: '/relatorios/clientes',
        icon: Building2,
        tone: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15',
      },
      {
        title: 'Modalidades de serviço',
        description: 'Compare volume e valor concluído entre os tipos de serviço.',
        href: '/relatorios/modalidades',
        icon: Layers3,
        tone: 'bg-indigo-500/10 text-indigo-600 ring-indigo-500/15',
      },
    ],
  },
  {
    title: 'Entregadores e SLA',
    description: 'Compare desempenho e encontre os gargalos de tempo em cada etapa da entrega.',
    reports: [
      {
        title: 'Ranking de entregadores',
        description: 'Ordene por entregas, conclusão, aceite, tempo médio ou repasse.',
        href: '/relatorios/entregadores',
        icon: Trophy,
        tone: 'bg-amber-500/10 text-amber-700 ring-amber-500/15',
      },
      {
        title: 'Tempos e SLA',
        description: 'Média, mediana, p90, amostras e comparação com os alertas configurados.',
        href: '/relatorios/tempos-sla',
        icon: TimerReset,
        tone: 'bg-rose-500/10 text-rose-600 ring-rose-500/15',
      },
    ],
  },
  {
    title: 'Financeiro',
    description: 'Acompanhe a divisão dos valores concluídos no período selecionado.',
    reports: [
      {
        title: 'Composição financeira',
        description: 'Valor concluído, repasse aos entregadores e receita da plataforma.',
        href: '/relatorios/financeiro',
        icon: CircleDollarSign,
        tone: 'bg-green-500/10 text-green-700 ring-green-500/15',
      },
    ],
  },
];

function ReportCard({ report }: { report: ReportLink }) {
  const Icon = report.icon;

  return (
    <Link
      href={report.href}
      className="group flex min-h-32 items-center gap-4 rounded-2xl border border-border/75 bg-card/90 p-5 shadow-[0_1px_2px_rgba(16,37,47,0.05),0_14px_30px_-26px_rgba(15,107,112,0.65)] ring-1 ring-white/70 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_10px_28px_-20px_rgba(15,107,112,0.45)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <span
        className={`grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${report.tone}`}
      >
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-base font-semibold leading-5 text-admin-deep">
          {report.title}
        </span>
        <span className="mt-1.5 block text-sm leading-5 text-muted-foreground">
          {report.description}
        </span>
      </span>
      <ArrowRight
        className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary"
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-admin-deep">
            Central de relatórios
          </h1>
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Dados operacionais reais
          </Badge>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Escolha a análise que precisa consultar. Os relatórios disponíveis usam registros reais de
          pedidos, clientes, entregadores e valores concluídos.
        </p>
      </header>

      {reportGroups.map((group) => (
        <section key={group.title} className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-admin-deep">{group.title}</h2>
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
