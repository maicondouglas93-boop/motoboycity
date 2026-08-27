import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DeliveryStatus } from '@motoboycity/types';
import { Icon, type IconName } from './Icon';
import { RouteTimeline, type RouteStop } from './RouteTimeline';
import { colors } from '../theme/colors';

type StagePresentation = {
  icon: IconName;
  progressLabel: string;
  badgeLabel?: string;
  attention?: boolean;
};

const ACTIVE_STAGES: Partial<Record<DeliveryStatus, StagePresentation>> = {
  ACCEPTED: { icon: 'arrow', progressLabel: 'A caminho da coleta' },
  COLLECTED: {
    icon: 'check',
    progressLabel: 'A caminho da entrega',
    badgeLabel: 'Coletado',
  },
  DELIVERED: {
    icon: 'return',
    progressLabel: 'Retorno à coleta',
    badgeLabel: 'Entregue',
    attention: true,
  },
  FAILED: {
    icon: 'return',
    progressLabel: 'Devolução à loja',
    badgeLabel: 'Atenção',
    attention: true,
  },
};

export type DeliveryCardProps = {
  /** Hora em que o pedido entrou, no formato curto (`14:09`). */
  time?: string;
  displayNumber?: number;
  companyName: string;
  /** Texto do estado do pedido, como "Faturado" ou "Em entrega". */
  statusLabel?: string;
  deliveryStatus?: DeliveryStatus;
  supportingLabel?: string;
  distanceLabel?: string;
  amountLabel?: string;
  /** Cronometro correndo, em vermelho, no canto superior direito. */
  countdownLabel?: string;
  stops?: ReadonlyArray<RouteStop>;
  onPressDetails?: () => void;
  onPress?: () => void;
  children?: React.ReactNode;
};

/**
 * O cartao de pedido, usado na lista de andamento, nos disponiveis e no
 * historico.
 *
 * A leitura foi montada para acontecer nesta ordem: quanto vou receber, de
 * quem e, e so entao o caminho. E o que decide se vale a pena aceitar, e o
 * motoboy costuma estar parado na moto quando le.
 */
export function DeliveryCard({
  time,
  displayNumber,
  companyName,
  statusLabel,
  deliveryStatus,
  supportingLabel,
  distanceLabel,
  amountLabel,
  countdownLabel,
  stops,
  onPressDetails,
  onPress,
  children,
}: DeliveryCardProps) {
  const Container = onPress ? Pressable : View;
  const stage = deliveryStatus ? ACTIVE_STAGES[deliveryStatus] : undefined;
  const accessibilityLabel =
    onPress && displayNumber && stage
      ? `Abrir pedido ${displayNumber}, ${stage.progressLabel}`
      : undefined;

  return (
    <Container
      style={styles.cartao}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.topo}>
        <View style={styles.identificacao}>
          {time && <Text style={styles.hora}>{time}</Text>}
          <Icon name="person" size={16} color={colors.inkSoft} />
          <Text style={styles.empresa} numberOfLines={1}>
            {displayNumber ? `#${displayNumber} · ${companyName}` : companyName}
          </Text>
        </View>

        <View style={styles.valores}>
          {countdownLabel ? (
            <View style={styles.cronometro}>
              <Text style={styles.cronometroTexto}>{countdownLabel}</Text>
            </View>
          ) : null}
          {distanceLabel && <Text style={styles.distancia}>{distanceLabel}</Text>}
          {amountLabel && <Text style={styles.valor}>{amountLabel}</Text>}
        </View>
      </View>

      {stage ? (
        <View style={styles.etapa}>
          <View style={styles.progresso}>
            <View style={[styles.iconeEtapa, stage.attention && styles.iconeEtapaAtencao]}>
              <Icon
                name={stage.icon}
                size={14}
                color={stage.attention ? colors.warning : colors.success}
              />
            </View>
            <View style={styles.progressoTexto}>
              <Text style={styles.etapaTitulo}>{stage.progressLabel}</Text>
              {supportingLabel ? <Text style={styles.apoio}>{supportingLabel}</Text> : null}
            </View>
          </View>

          {stage.badgeLabel ? (
            <View style={[styles.tag, stage.attention && styles.tagAtencao]}>
              <Text style={[styles.tagTexto, stage.attention && styles.tagTextoAtencao]}>
                {stage.badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : statusLabel ? (
        <Text style={styles.status}>{statusLabel}</Text>
      ) : null}

      {stops && stops.length > 0 && (
        <View style={styles.rota}>
          <RouteTimeline stops={stops} />
        </View>
      )}

      {children}

      {onPressDetails && (
        <Pressable onPress={onPressDetails} hitSlop={8} style={styles.detalhes}>
          <Text style={styles.detalhesTexto}>Todos os detalhes</Text>
        </Pressable>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  cartao: {
    paddingVertical: 10,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  identificacao: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hora: { fontSize: 14, fontWeight: '700', color: colors.ink },
  empresa: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  valores: { alignItems: 'flex-end' },
  cronometro: {
    backgroundColor: colors.countdown,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 4,
  },
  cronometroTexto: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  distancia: { fontSize: 13, color: colors.inkSoft },
  valor: { fontSize: 15, fontWeight: '700', color: colors.ink },
  status: { fontSize: 14, fontWeight: '700', color: colors.ink },
  etapa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progresso: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconeEtapa: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successSoft,
  },
  iconeEtapaAtencao: { backgroundColor: colors.warningSoft },
  progressoTexto: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  etapaTitulo: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: colors.ink },
  apoio: { fontSize: 10, fontWeight: '600', color: colors.inkMuted },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: colors.successSoft,
  },
  tagAtencao: { backgroundColor: colors.warningSoft },
  tagTexto: { fontSize: 10, fontWeight: '800', color: colors.success },
  tagTextoAtencao: { color: colors.warning },
  rota: { marginTop: 6 },
  detalhes: { alignSelf: 'flex-end' },
  detalhesTexto: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
