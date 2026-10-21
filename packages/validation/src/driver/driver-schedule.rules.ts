/**
 * A escala do motoboy: a semana fixa em que ele pode trabalhar.
 *
 * Regras puras, sem tela e sem banco. Moram neste pacote porque o servidor
 * barra o "Ativo" e o despacho com as mesmas contas que o ADM e o aplicativo
 * mostram — e as tres pontas nao podem discordar sobre se ele esta no turno.
 *
 * As contas de relogio sao as do horario da loja online (`store-schedule.rules`):
 * fuso de Brasilia, varios periodos por dia e periodo que passa da meia-noite.
 * A escala e um horario de funcionamento sem datas especiais e sem ajuste
 * manual, entao reaproveita o calculo em vez de ter um segundo.
 */
import type {
  DriverWorkSchedule,
  DriverWorkScheduleStatus,
  DriverWorkShift,
  Funcionamento,
} from '@motoboycity/types';
import {
  DIAS_DA_SEMANA,
  duracaoDaFaixa,
  emMinutos,
  hora,
  momentoNaLoja,
  passaDaMeiaNoite,
  rotuloDoDia,
  situacaoDaLoja,
} from '../company/store-schedule.rules';

export const MAX_TURNOS_POR_DIA = 4;

const DIA_EM_MINUTOS = 1440;
const SEMANA_EM_MINUTOS = 7 * DIA_EM_MINUTOS;

function comoFaixa(turno: DriverWorkShift) {
  return { abre: turno.start, fecha: turno.end };
}

/** A escala no formato do horario da loja, para usar as mesmas contas. */
export function escalaComoFuncionamento(escala: DriverWorkSchedule): Funcionamento {
  return {
    semana: escala.days.map((dia) => ({ dia: dia.weekday, faixas: dia.shifts.map(comoFaixa) })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: '',
  };
}

/** Quanto o turno dura, em minutos. */
export function duracaoDoTurno(turno: DriverWorkShift): number {
  return duracaoDaFaixa(comoFaixa(turno));
}

/** Se o turno termina no dia seguinte. */
export function turnoPassaDaMeiaNoite(turno: DriverWorkShift): boolean {
  return passaDaMeiaNoite(comoFaixa(turno));
}

/** "11:00 às 15:00", ou "18:00 às 02:00 do dia seguinte". */
export function textoDoTurno(turno: DriverWorkShift): string {
  const base = `${turno.start} às ${turno.end}`;
  return turnoPassaDaMeiaNoite(turno) ? `${base} do dia seguinte` : base;
}

/** "sexta às 11:00", "hoje às 18:00", "amanhã às 07:00". */
function quando(instante: Date, agora: Date): string {
  return `${rotuloDoDia(momentoNaLoja(instante).data, agora)} às ${hora(instante)}`;
}

/**
 * Se o motoboy esta num turno agora, e o que dizer a ele.
 *
 * Turnos encostados viram um so — sexta 18:00 a 00:00 seguida de sabado 00:00
 * a 02:00 e "no turno ate 02:00" —, porque e assim que a conta da loja junta
 * as faixas.
 */
export function situacaoDaEscala(
  escala: DriverWorkSchedule,
  agora: Date,
): DriverWorkScheduleStatus {
  const situacao = situacaoDaLoja(escalaComoFuncionamento(escala), agora);
  if (situacao.aberta) {
    return {
      onShift: true,
      changesAt: situacao.muda?.toISOString() ?? null,
      label: situacao.muda ? `No turno até ${hora(situacao.muda)}` : 'No turno',
    };
  }
  return {
    onShift: false,
    changesAt: situacao.muda?.toISOString() ?? null,
    label: situacao.muda
      ? `Fora da escala · próximo turno ${quando(situacao.muda, agora)}`
      : 'Fora da escala',
  };
}

/**
 * O que o motoboy le quando tenta ficar Ativo fora do turno.
 *
 * Diz QUANDO ele pode: "fora da escala" sozinho o faz tentar de novo daqui a
 * cinco minutos, ou ligar para a central.
 */
export function mensagemForaDaEscala(escala: DriverWorkSchedule, agora: Date): string {
  const situacao = situacaoDaLoja(escalaComoFuncionamento(escala), agora);
  const proximo = !situacao.aberta && situacao.muda ? situacao.muda : null;
  return proximo
    ? `Você está fora da sua escala. O próximo turno começa ${quando(proximo, agora)}.`
    : 'Você está fora da sua escala. Fale com a central para ajustar seus turnos.';
}

/**
 * Turnos que se sobrepoem, em frases para a tela.
 *
 * A conta e feita na semana inteira, em minutos desde domingo 00:00 e dando a
 * volta no fim da semana — e assim que o turno de sabado que passa da
 * meia-noite encontra o de domingo cedo. Turno que termina exatamente quando o
 * outro comeca nao conta: e o almoco seguido do jantar sem intervalo.
 */
export function turnosSobrepostos(escala: DriverWorkSchedule): string[] {
  const trechos = escala.days.flatMap((dia) =>
    dia.shifts.map((turno) => ({
      dia: dia.weekday,
      turno,
      inicio: dia.weekday * DIA_EM_MINUTOS + emMinutos(turno.start),
      duracao: duracaoDoTurno(turno),
    })),
  );

  const problemas: string[] = [];
  for (let i = 0; i < trechos.length; i += 1) {
    for (let j = i + 1; j < trechos.length; j += 1) {
      const a = trechos[i]!;
      const b = trechos[j]!;
      // Distancia de a ate b dando a volta na semana, e vice-versa.
      const deAparaB = (b.inicio - a.inicio + SEMANA_EM_MINUTOS) % SEMANA_EM_MINUTOS;
      const deBparaA = (a.inicio - b.inicio + SEMANA_EM_MINUTOS) % SEMANA_EM_MINUTOS;
      if (deAparaB < a.duracao || deBparaA < b.duracao) {
        problemas.push(
          `${DIAS_DA_SEMANA[a.dia] ?? ''} ${textoDoTurno(a.turno)} e ` +
            `${(DIAS_DA_SEMANA[b.dia] ?? '').toLowerCase()} ${textoDoTurno(b.turno)} se sobrepõem.`,
        );
      }
    }
  }
  return problemas;
}

/** Se a escala tem pelo menos um turno. Escala vazia barraria o motoboy para sempre. */
export function escalaTemTurno(escala: DriverWorkSchedule): boolean {
  return escala.days.some((dia) => dia.shifts.length > 0);
}

/** Uma semana sem turno nenhum, na ordem de domingo a sabado — o ponto de partida do ADM. */
export function escalaVazia(): DriverWorkSchedule {
  return { days: DIAS_DA_SEMANA.map((_, weekday) => ({ weekday, shifts: [] })) };
}

/** Os turnos ordenados pelo horario de inicio, para mostrar. */
export function turnosEmOrdem(turnos: DriverWorkShift[]): DriverWorkShift[] {
  return [...turnos].sort((a, b) => emMinutos(a.start) - emMinutos(b.start));
}
