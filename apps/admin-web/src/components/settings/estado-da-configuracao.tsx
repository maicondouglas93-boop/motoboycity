import type { LucideIcon } from 'lucide-react';

/**
 * Em que pé está uma configuração.
 *
 * As telas de configuração tinham três situações pintadas do mesmo cinza:
 * limite valendo, limite desligado de propósito, e limite que deveria existir e
 * não existe. Sem distinguir as três, "sem limite" e "60 segundos" liam igual —
 * e quem abria a tela não sabia o que estava de fato governando a operação.
 *
 * - `definido` — há uma regra valendo.
 * - `desligado` — não há trava, e isso foi escolha de alguém.
 * - `faltando` — deveria estar configurado e não está. É o único que pede ação.
 */
export type EstadoDaConfiguracao = 'definido' | 'desligado' | 'faltando';

export const ESTILO_DO_ESTADO: Record<
  EstadoDaConfiguracao,
  { pilula: string; texto: string; ponto: string; rotulo: string }
> = {
  definido: {
    pilula: 'bg-admin-soft text-admin-deep ring-admin-deep/15',
    texto: 'text-admin-deep',
    ponto: 'bg-placa',
    rotulo: 'Regra valendo',
  },
  desligado: {
    pilula: 'bg-muted text-muted-foreground ring-border/70',
    texto: 'text-muted-foreground',
    ponto: 'bg-status-aguardando',
    rotulo: 'Sem trava',
  },
  faltando: {
    pilula: 'bg-alerta/10 text-alerta ring-alerta/25',
    texto: 'text-alerta',
    ponto: 'bg-alerta',
    rotulo: 'Precisa configurar',
  },
};

/**
 * Cores das áreas de configuração.
 *
 * Vêm da paleta da marca — `colete` é a cor do colete do motoboy, `placa` a da
 * placa — em vez de uma paleta nova só para esta parte do painel.
 */
export const TONS = {
  despacho: { icone: 'bg-primary/10 text-primary', trilho: 'bg-primary' },
  horarios: { icone: 'bg-status-pagamento/10 text-status-pagamento', trilho: 'bg-status-pagamento' },
  alertas: { icone: 'bg-colete/15 text-colete-escuro', trilho: 'bg-colete-escuro' },
  capacidade: { icone: 'bg-placa/10 text-placa', trilho: 'bg-placa' },
  precos: { icone: 'bg-dinheiro-recebido-suave text-dinheiro-recebido', trilho: 'bg-dinheiro-recebido' },
  modalidades: { icone: 'bg-admin-soft text-admin-deep', trilho: 'bg-admin-deep' },
} as const;

export type Tom = keyof typeof TONS;

/**
 * A situação de uma área, em uma linha.
 *
 * Um ponto colorido e um texto curto. O ponto existe para a informação não
 * depender só da cor do texto: quem enxerga mal cor ainda vê que há três
 * marcadores diferentes, e o `title` diz qual é.
 */
export function LinhaDeEstado({
  estado,
  children,
}: {
  estado: EstadoDaConfiguracao;
  children: React.ReactNode;
}) {
  const estilo = ESTILO_DO_ESTADO[estado];
  return (
    <span
      title={estilo.rotulo}
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${estilo.texto}`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${estilo.ponto}`} />
      {children}
    </span>
  );
}

/** Pílula com o valor vigente de um campo. */
export function PilulaDeEstado({
  estado,
  children,
}: {
  estado: EstadoDaConfiguracao;
  children: React.ReactNode;
}) {
  const estilo = ESTILO_DO_ESTADO[estado];
  return (
    <span
      title={estilo.rotulo}
      className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${estilo.pilula}`}
    >
      {children}
    </span>
  );
}

/** Ícone da área, no tom dela. */
export function IconeDaArea({ icon: Icon, tom }: { icon: LucideIcon; tom: Tom }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONS[tom].icone}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

/**
 * Cabecalho das telas de configuracao.
 *
 * Repete o icone, o tom e a MESMA frase de estado que o cartao do indice mostra.
 * Sem isso, o indice dizia "Nenhuma tabela ativa" e a tela de dentro abria sem
 * dizer nada — quem entrava perdia a informacao que o trouxe ate ali.
 */
export function CabecalhoDeConfiguracao({
  icon,
  tom,
  titulo,
  descricao,
  situacao,
}: {
  icon: LucideIcon;
  tom: Tom;
  titulo: string;
  descricao: string;
  situacao?: { estado: EstadoDaConfiguracao; texto: string } | null;
}) {
  return (
    <div className="flex gap-4">
      <IconeDaArea icon={icon} tom={tom} />
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold text-admin-deep">{titulo}</h1>
        <p className="text-sm leading-5 text-muted-foreground">{descricao}</p>
        {situacao && (
          <p className="pt-1">
            <LinhaDeEstado estado={situacao.estado}>{situacao.texto}</LinhaDeEstado>
          </p>
        )}
      </div>
    </div>
  );
}
