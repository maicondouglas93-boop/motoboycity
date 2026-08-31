'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  CalendarClock,
  CloudRain,
  Gavel,
  MapPinned,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { QueryState } from '@/components/ui/query-state';
import { AdminPageHeader } from '@/components/layout/admin-page-header';
import {
  IconeDaArea,
  LinhaDeEstado,
  TONS,
  type EstadoDaConfiguracao,
  type Tom,
} from '@/components/settings/estado-da-configuracao';
import {
  adminBusinessHoursApi,
  adminPlatformSettingsApi,
  adminPricingTablesApi,
  adminServiceTypesApi,
  adminSurchargesApi,
  adminRegionsApi,
} from '@/lib/api-client';
import { session } from '@/lib/session';

type Situacao = { estado: EstadoDaConfiguracao; texto: string };

type AreaDeConfiguracao = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tom: Tom;
  situacao: Situacao | null;
};

function contar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

/**
 * Índice das configurações, com a SITUAÇÃO de cada área.
 *
 * Era uma lista de cinco atalhos com a mesma engrenagem cinza, e nenhuma dizia
 * como aquela área estava. Descobrir que não havia tabela de preço ativa, ou que
 * o bloqueio de horário estava desligado, exigia entrar em cada uma.
 *
 * Agora cada cartão responde na própria linha, e o vermelho aparece só onde há
 * algo faltando de verdade — "sem taxa adicional" é escolha, não problema.
 */
export default function SettingsPage() {
  const token = session.getToken();
  const habilitado = Boolean(token);

  const modalidadesQuery = useQuery({
    queryKey: ['admin', 'service-types'],
    queryFn: () => adminServiceTypesApi.list(token as string),
    enabled: habilitado,
  });
  const tabelasQuery = useQuery({
    queryKey: ['admin', 'pricing-tables'],
    queryFn: () => adminPricingTablesApi.list(token as string),
    enabled: habilitado,
  });
  const horariosQuery = useQuery({
    queryKey: ['admin', 'business-hours'],
    queryFn: () => adminBusinessHoursApi.get(token as string),
    enabled: habilitado,
  });
  const taxasQuery = useQuery({
    queryKey: ['admin', 'surcharges'],
    queryFn: () => adminSurchargesApi.list(token as string),
    enabled: habilitado,
  });
  const operacaoQuery = useQuery({
    queryKey: ['admin', 'platform-settings'],
    queryFn: () => adminPlatformSettingsApi.get(token as string),
    enabled: habilitado,
  });
  const regioesQuery = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: () => adminRegionsApi.list(token as string),
    enabled: habilitado,
  });

  const modalidadesAtivas = modalidadesQuery.data?.filter((item) => item.active).length ?? null;
  const tabelasAtivas = tabelasQuery.data?.filter((item) => item.active).length ?? null;
  const horarios = horariosQuery.data;
  const taxas = taxasQuery.data;
  const operacao = operacaoQuery.data;
  const regioesAtivas = regioesQuery.data?.filter((item) => item.active).length ?? null;
  const hasQueryError = [
    modalidadesQuery,
    tabelasQuery,
    horariosQuery,
    taxasQuery,
    operacaoQuery,
    regioesQuery,
  ].some((query) => query.isError);

  /**
   * Quantos limites da tela de Operação estão sem valor.
   *
   * Só entram os que, faltando, deixam uma regra de fora — não os que podem
   * ficar desligados de propósito, como os alertas de SLA.
   */
  const operacaoFaltando =
    operacao === undefined
      ? null
      : [
          operacao.dispatchOfferTimeoutSeconds,
          operacao.collectionProximityRadiusMeters,
          operacao.returnProximityRadiusMeters,
          operacao.deliveryProximityRadiusMeters,
        ].filter((valor) => valor === null).length;

  const areas: AreaDeConfiguracao[] = [
    {
      href: '/configuracoes/regioes',
      title: 'Regioes operacionais',
      description: 'Cadastre as pracas que organizam empresas, motoboys, precos e despacho.',
      icon: MapPinned,
      tom: 'despacho',
      situacao:
        regioesAtivas === null
          ? null
          : regioesAtivas === 0
            ? { estado: 'faltando', texto: 'Nenhuma regiao ativa' }
            : {
                estado: 'definido',
                texto: contar(regioesAtivas, 'regiao ativa', 'regioes ativas'),
              },
    },
    {
      href: '/configuracoes/tipos-de-servico',
      title: 'Tipos de serviços',
      description: 'Cadastre e mantenha as modalidades que podem ser atribuídas aos entregadores.',
      icon: Bike,
      tom: 'modalidades',
      situacao:
        modalidadesAtivas === null
          ? null
          : modalidadesAtivas === 0
            ? // Sem modalidade ativa o despacho nao tem o que oferecer.
              { estado: 'faltando', texto: 'Nenhuma modalidade ativa' }
            : { estado: 'definido', texto: contar(modalidadesAtivas, 'ativa', 'ativas') },
    },
    {
      href: '/configuracoes/tabela-de-precos',
      title: 'Tabelas de preços',
      description: 'Consulte e altere os valores que são congelados na criação de cada pedido.',
      icon: Tag,
      tom: 'precos',
      situacao:
        tabelasAtivas === null
          ? null
          : tabelasAtivas === 0
            ? // Sem tabela ativa, o pedido nao tem como ser cotado.
              { estado: 'faltando', texto: 'Nenhuma tabela ativa' }
            : {
                estado: 'definido',
                texto: contar(tabelasAtivas, 'tabela ativa', 'tabelas ativas'),
              },
    },
    {
      href: '/configuracoes/horario',
      title: 'Horário de funcionamento',
      description:
        'Defina as faixas em que a operação aceita pedidos, e o dia em que o motoboy pode pedir saque.',
      icon: CalendarClock,
      tom: 'horarios',
      situacao: !horarios
        ? null
        : !horarios.enabled
          ? // Desligado e escolha legitima: a operacao aceita pedido a qualquer hora.
            { estado: 'desligado', texto: 'Sem bloqueio de horário' }
          : horarios.openNow
            ? { estado: 'definido', texto: 'Aberto agora' }
            : {
                estado: 'definido',
                texto: horarios.nextOpeningLabel
                  ? `Fechado · abre ${horarios.nextOpeningLabel}`
                  : 'Fechado agora',
              },
    },
    {
      href: '/configuracoes/taxas',
      title: 'Taxas adicionais',
      description:
        'Acréscimos para chuva, feriado ou madrugada — com nome, valor e janela definidos por você.',
      icon: CloudRain,
      tom: 'alertas',
      situacao: !taxas
        ? null
        : taxas.some((taxa) => taxa.activeNow)
          ? {
              estado: 'definido',
              texto: `${contar(taxas.filter((taxa) => taxa.activeNow).length, 'taxa', 'taxas')} valendo agora`,
            }
          : // Nenhuma taxa valendo e o estado normal da operacao, nao um defeito.
            { estado: 'desligado', texto: 'Nenhuma taxa valendo agora' },
    },
    {
      href: '/configuracoes/operacao',
      title: 'Operação',
      description:
        'Defina o tempo de resposta de uma oferta e o raio aceito para concluir um retorno.',
      icon: SlidersHorizontal,
      tom: 'despacho',
      situacao:
        operacaoFaltando === null
          ? null
          : operacaoFaltando === 0
            ? { estado: 'definido', texto: 'Limites configurados' }
            : {
                estado: 'faltando',
                texto: `${contar(operacaoFaltando, 'limite', 'limites')} sem configurar`,
              },
    },
    {
      href: '/configuracoes/punicao',
      title: 'Punição de entregadores',
      description: 'Tire do despacho, por um tempo, quem recusa ofertas seguidas.',
      icon: Gavel,
      tom: 'capacidade',
      situacao:
        operacao === undefined
          ? null
          : !operacao.driverPunishmentEnabled
            ? { estado: 'desligado', texto: 'Nenhuma punição automática' }
            : operacao.driverPunishmentOfferCount === null ||
                operacao.driverPunishmentMinutes === null
              ? { estado: 'faltando', texto: 'Ativa, sem quantidade ou tempo' }
              : {
                  estado: 'definido',
                  texto: `${contar(operacao.driverPunishmentOfferCount, 'recusa', 'recusas')} · ${operacao.driverPunishmentMinutes} min fora`,
                },
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={SlidersHorizontal}
        eyebrow="Governança do sistema"
        title="Configurações operacionais"
        description="Revise preços, regiões, horários e regras que controlam a operação real."
        tone="settings"
      />
      {hasQueryError && (
        <QueryState
          compact
          kind="error"
          title="Algumas situações não puderam ser consultadas"
          description="Os atalhos continuam disponíveis, mas indicadores incompletos não significam configuração vazia."
          onAction={() => {
            void Promise.all([
              modalidadesQuery.refetch(),
              tabelasQuery.refetch(),
              horariosQuery.refetch(),
              taxasQuery.refetch(),
              operacaoQuery.refetch(),
              regioesQuery.refetch(),
            ]);
          }}
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <Link key={area.href} href={area.href}>
            <Card className="interactive-card relative overflow-hidden h-full border-border/50 bg-gradient-to-br from-card to-admin-soft/10 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-admin-soft/40">
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1.5 ${TONS[area.tom].trilho}`}
              />
              <CardContent className="flex gap-4 py-6">
                <IconeDaArea icon={area.icon} tom={area.tom} />
                <div className="min-w-0">
                  <p className="font-heading font-semibold text-admin-deep">{area.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{area.description}</p>
                  {/*
                    Enquanto carrega, nao aparece nada — melhor do que mostrar
                    "0 ativas" por um instante e assustar quem esta passando.
                  */}
                  {area.situacao && (
                    <p className="mt-2">
                      <LinhaDeEstado estado={area.situacao.estado}>
                        {area.situacao.texto}
                      </LinhaDeEstado>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
