/**
 * Avisos que pedem atenção agora — não um histórico de eventos.
 *
 * A decisão que molda todo o resto: **o aviso é derivado do estado atual**, e
 * não gravado quando algo acontece. Fatura vencida, empresa esperando aprovação
 * e despacho sem tempo de oferta configurado são CONDIÇÕES, não acontecimentos:
 * elas continuam verdadeiras até alguém resolver, e param de existir no instante
 * em que a pessoa age.
 *
 * Isso dispensa tabela, escrita a cada evento, estado de lido por usuário e job
 * de limpeza. Também evita o pior defeito de uma caixa de entrada: continuar
 * mostrando como pendente algo que já foi resolvido.
 *
 * O preço é não haver histórico nem "marcar como lido". Se um dia a operação
 * precisar de evento com hora e leitura por pessoa, isso é outra funcionalidade
 * — com tabela própria — e não uma evolução desta.
 */

/**
 * `critical` é reservado para o que impede a operação de funcionar ou custa
 * dinheiro agora. Se tudo for crítico, nada é.
 */
export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface NotificationItem {
  /**
   * Estável por condição, não por ocorrência: a mesma situação produz sempre o
   * mesmo id. É o que permite ao painel comparar duas leituras sem inventar
   * chave, e o que tornaria possível dispensar um aviso no futuro.
   */
  id: string;
  severity: NotificationSeverity;
  title: string;
  /** Uma frase dizendo o tamanho do problema, com número quando houver. */
  description: string;
  /** Para onde levar quem quiser resolver. `null` quando não há tela que resolva. */
  href: string | null;
  actionLabel: string | null;
}

export interface NotificationsResult {
  items: NotificationItem[];
  /** Quantos são `critical` — o que o sino destaca. */
  criticalCount: number;
}
