/**
 * Marcacao retroativa: o motoboy esqueceu de tocar o botao e informa depois a
 * que horas a etapa aconteceu de verdade.
 *
 * A funcionalidade so e util porque motoboy esquece — mas declarar o proprio
 * horario e, sem trava, declarar o proprio faturamento. O que separa uma coisa
 * da outra sao as tres checagens abaixo, e a terceira e a que importa: sem
 * intervalo minimo da para declarar coleta e entrega no mesmo minuto e fechar a
 * corrida sem sair do lugar.
 *
 * A janela permitida se fecha sozinha nas duas pontas — nao pode ser no futuro,
 * nem antes da etapa anterior — entao nao ha limite arbitrario de "ate quantas
 * horas atras": o proprio historico do pedido e o limite.
 */
export type RetroactiveProblem =
  | { kind: 'FUTURE' }
  | { kind: 'BEFORE_PREVIOUS' }
  | { kind: 'TOO_SOON'; minMinutes: number; declaredMinutes: number };

export interface RetroactiveInput {
  /** Horario que o motoboy declara para a etapa. */
  declaredAt: Date;
  /** Horario efetivo da etapa anterior — o piso da janela permitida. */
  previousAt: Date;
  now: Date;
  /** Null = o admin nao configurou restricao, entao nao ha o que exigir. */
  minMinutes: number | null;
}

export function checkRetroactiveMarking(input: RetroactiveInput): RetroactiveProblem | null {
  if (input.declaredAt.getTime() > input.now.getTime()) {
    return { kind: 'FUTURE' };
  }

  if (input.declaredAt.getTime() < input.previousAt.getTime()) {
    return { kind: 'BEFORE_PREVIOUS' };
  }

  if (input.minMinutes === null) {
    return null;
  }

  const declaredMinutes = (input.declaredAt.getTime() - input.previousAt.getTime()) / 60_000;
  /**
   * Intervalo semiaberto: declarar exatamente o minimo passa.
   *
   * O numero configurado e "a partir de quanto tempo isso e plausivel", e nao
   * "estritamente mais que". Recusar o valor exato faria o admin que digitou 5
   * precisar entender que o sistema quer 6.
   */
  if (declaredMinutes < input.minMinutes) {
    return { kind: 'TOO_SOON', minMinutes: input.minMinutes, declaredMinutes };
  }

  return null;
}

/**
 * Horario declarado em texto, no relogio da operacao.
 *
 * A nota do historico e lida por pessoas — o admin conferindo o que aconteceu,
 * a loja perguntando. Gravar UTC faria a coleta das 14h aparecer como 17h para
 * todo mundo que ler depois.
 */
const declaredTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function describeDeclaredTime(declaredAt: Date): string {
  return declaredTimeFormatter.format(declaredAt);
}

/** Mensagem para o motoboy, que e quem le o erro no celular. */
export function describeRetroactiveProblem(problem: RetroactiveProblem): string {
  switch (problem.kind) {
    case 'FUTURE':
      return 'O horário informado está no futuro.';
    case 'BEFORE_PREVIOUS':
      return 'O horário informado é anterior à etapa anterior deste pedido.';
    case 'TOO_SOON': {
      const minutos = Math.floor(problem.declaredMinutes);
      return (
        `É preciso informar pelo menos ${problem.minMinutes} minuto(s) depois da etapa ` +
        `anterior (você informou ${minutos}).`
      );
    }
  }
}
