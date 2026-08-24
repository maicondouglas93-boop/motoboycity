import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Estado do dinheiro que o cartão representa.
 *
 * É intenção, não cor: quem usa diz o que o número significa, e a paleta
 * decide como isso aparece. Assim a regra "vermelho só para o que exige ação
 * hoje" fica em um lugar só, em vez de depender de cada chamada escolher bem.
 */
export type IntencaoFinanceira =
  | 'nao-cobrado'
  | 'aguardando'
  | 'atrasado'
  | 'recebido'
  | 'retido'
  | 'informativo';

const ESTILOS: Record<IntencaoFinanceira, { fundo: string; texto: string; icone: string }> = {
  'nao-cobrado': {
    fundo: 'bg-dinheiro-nao-cobrado-suave',
    texto: 'text-dinheiro-nao-cobrado',
    icone: 'text-dinheiro-nao-cobrado',
  },
  aguardando: {
    fundo: 'bg-dinheiro-aguardando-suave',
    texto: 'text-dinheiro-aguardando',
    icone: 'text-dinheiro-aguardando',
  },
  atrasado: {
    fundo: 'bg-dinheiro-atrasado-suave',
    texto: 'text-dinheiro-atrasado',
    icone: 'text-dinheiro-atrasado',
  },
  recebido: {
    fundo: 'bg-dinheiro-recebido-suave',
    texto: 'text-dinheiro-recebido',
    icone: 'text-dinheiro-recebido',
  },
  retido: {
    fundo: 'bg-dinheiro-retido-suave',
    texto: 'text-dinheiro-retido',
    icone: 'text-dinheiro-retido',
  },
  informativo: {
    fundo: 'bg-dinheiro-informativo-suave',
    texto: 'text-dinheiro-informativo',
    icone: 'text-dinheiro-informativo',
  },
};

export type MetricCardProps = {
  label: string;
  value: string;
  /** Uma linha dizendo o que o número quer dizer. Valor sozinho não se explica. */
  hint?: string;
  intent?: IntencaoFinanceira;
  icon?: LucideIcon;
  /**
   * Para onde o cartão leva.
   *
   * Vale a pena preencher sempre que existir uma lista por trás: o problema da
   * tela antiga era justamente número que não levava a lugar nenhum, deixando o
   * admin sem saber o que fazer com a informação.
   */
  href?: string;
  /**
   * Neutraliza a cor quando o valor é zero.
   *
   * "R$ 0,00 vencido" não é alarme nem conquista. Pintar zero de vermelho
   * ensina o admin a ignorar o vermelho, e é o começo do fim da cor como aviso.
   */
  neutralizarZero?: boolean;
};

export function MetricCard({
  label,
  value,
  hint,
  intent = 'informativo',
  icon: Icone,
  href,
  neutralizarZero = false,
}: MetricCardProps) {
  const zerado = neutralizarZero && ehZero(value);
  const estilo = ESTILOS[zerado ? 'retido' : intent];

  const conteudo = (
    <div className={`flex h-full flex-col gap-1 rounded-xl p-4 ${estilo.fundo}`}>
      <div className="flex items-center gap-2">
        {Icone && <Icone aria-hidden className={`size-4 shrink-0 ${estilo.icone}`} />}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={`font-mono text-2xl font-semibold tracking-[-0.045em] tabular-nums ${estilo.texto}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  if (!href) return conteudo;

  return (
    <Link
      href={href}
      className="rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-ring hover:brightness-[0.98]"
    >
      {conteudo}
    </Link>
  );
}

/**
 * Reconhece zero já formatado (`R$ 0,00`, `0`).
 *
 * Recebe o texto e não o número porque o cartão exibe string: quem chama já
 * formatou, e pedir os dois abriria espaco para eles discordarem.
 */
function ehZero(valorFormatado: string): boolean {
  return /^[^0-9-]*0(?:[.,]0+)?$/.test(valorFormatado.trim());
}
