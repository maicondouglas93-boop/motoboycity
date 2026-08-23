/**
 * Motoboy com pedido em andamento que parou de mandar posicao.
 *
 * O concorrente resolve isto NO SERVIDOR, e nao no aparelho — e essa e a
 * decisao certa. Uma checagem de "otimizacao de bateria ligada" dentro do app
 * so pega uma das causas, e so enquanto o app estiver vivo para checar. Do lado
 * do servidor, a ausencia de posicao e o sintoma comum de todas elas: bateria,
 * app fechado, permissao revogada, GPS desligado, sem sinal.
 */
export interface SilenceInput {
  /**
   * Ultimo momento em que soubemos onde ele estava.
   *
   * E a posicao mais recente entre os pedidos ativos dele. Quando nao ha
   * NENHUMA — o caso de quem aceitou e o rastreamento nunca subiu — cai para o
   * carimbo do pedido, que e quando ele assumiu o trabalho. E o certo: nunca
   * termos ouvido nada desde que ele pegou a corrida e exatamente o caso mais
   * grave, nao um caso a ignorar.
   */
  lastContactAt: Date;
  /** Quando o ultimo aviso foi disparado, para nao repetir. */
  alertedAt: Date | null;
  now: Date;
  /** Null = o admin nao configurou, entao o detector fica desligado. */
  thresholdMinutes: number | null;
}

export function silentMinutes(lastContactAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastContactAt.getTime()) / 60_000));
}

export function shouldAlertSilence(input: SilenceInput): boolean {
  if (input.thresholdMinutes === null) {
    return false;
  }
  if (silentMinutes(input.lastContactAt, input.now) < input.thresholdMinutes) {
    return false;
  }
  if (input.alertedAt === null) {
    return true;
  }

  /**
   * Um aviso por EPISODIO de silencio, nao um a cada rodada do detector.
   *
   * A comparacao com o ultimo contato e o que fecha o episodio sem precisar de
   * escrita nenhuma no caminho do ping: se chegou posicao depois do aviso, ele
   * voltou e sumiu de novo, e isso e um episodio novo. Se nao chegou, e o mesmo
   * silencio de antes — e repetir de dois em dois minutos so treina o motoboy a
   * ignorar o aviso.
   */
  return input.lastContactAt.getTime() > input.alertedAt.getTime();
}
