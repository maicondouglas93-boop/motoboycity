import type { DriverWorkSchedule, DriverWorkScheduleStatus } from '@motoboycity/types';
import {
  DIAS_DA_SEMANA,
  ORDEM_DA_SEMANA,
  textoDoTurno,
  turnosEmOrdem,
} from '@motoboycity/validation';

/**
 * A escala do motoboy em linhas de tela, sem tela.
 *
 * So usa as partes puras do pacote de regras: as contas de relogio de la usam
 * `formatToParts`, que o motor do Android nao garante. Se ele esta no turno o
 * servidor ja diz pronto, no `status`.
 */

export type LinhaDaEscala = {
  weekday: number;
  dia: string;
  hoje: boolean;
  /** "11:00 às 15:00", em ordem; vazio e folga. */
  turnos: string[];
};

/** Segunda a domingo, com os turnos de cada dia. `hoje` e o dia da semana (0 = domingo). */
export function linhasDaEscala(escala: DriverWorkSchedule, hoje: number): LinhaDaEscala[] {
  return ORDEM_DA_SEMANA.map((weekday) => ({
    weekday,
    dia: DIAS_DA_SEMANA[weekday] ?? '',
    hoje: weekday === hoje,
    turnos: turnosEmOrdem(escala.days.find((dia) => dia.weekday === weekday)?.shifts ?? []).map(
      textoDoTurno,
    ),
  }));
}

export type ResumoDaSituacao = {
  tom: 'livre' | 'no-turno' | 'fora';
  titulo: string;
  texto: string;
};

/** O quadro do topo da tela: livre, no turno ou fora da escala. */
export function resumoDaSituacao(
  escala: DriverWorkSchedule | null,
  status: DriverWorkScheduleStatus | null,
): ResumoDaSituacao {
  if (!escala || !status) {
    return {
      tom: 'livre',
      titulo: 'Sem escala',
      texto: 'Você pode ficar Ativo e receber pedidos a qualquer hora.',
    };
  }
  if (status.onShift) {
    return {
      tom: 'no-turno',
      titulo: status.label,
      texto: 'Você pode ficar Ativo e receber pedidos.',
    };
  }
  // "Fora da escala · próximo turno sexta às 11:00" vira titulo e detalhe.
  const [titulo = status.label, ...resto] = status.label.split(' · ');
  const proximo = resto.join(' · ');
  const detalhe = proximo ? `${proximo.charAt(0).toUpperCase()}${proximo.slice(1)}. ` : '';
  return {
    tom: 'fora',
    titulo,
    texto:
      `${detalhe}Fora do turno não dá para ficar Ativo e não chega pedido novo. ` +
      'O que você já aceitou continua valendo.',
  };
}
