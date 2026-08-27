import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DeliveryStatus } from '@motoboycity/types';
import { Icon } from './Icon';
import { RouteTimeline, type RouteStop } from './RouteTimeline';
import { colors } from '../theme/colors';

type StagePresentation = {
  badgeLabel: string;
  tone: 'default' | 'success' | 'warning';
};

const ACTIVE_STAGES: Partial<Record<DeliveryStatus, StagePresentation>> = {
  ACCEPTED: { badgeLabel: 'Aceito', tone: 'default' },
  COLLECTED: { badgeLabel: 'Coletado', tone: 'success' },
  DELIVERED: { badgeLabel: 'Retorno', tone: 'warning' },
  FAILED: { badgeLabel: 'Devolução', tone: 'warning' },
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
      ? `Abrir pedido ${displayNumber}, ${stage.badgeLabel}`
      : undefined;

  return (
    <Container
      style={styles.cartao}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.linhaPedido}>
        <Text style={styles.numeroPedido}>
          {displayNumber ? `#${displayNumber}` : 'Pedido'}
        </Text>
        {stage ? (
          <View
            style={[
              styles.tag,
              stage.tone === 'success' && styles.tagSucesso,
              stage.tone === 'warning' && styles.tagAtencao,
            ]}
          >
            <Text
              style={[
                styles.tagTexto,
                stage.tone === 'success' && styles.tagTextoSucesso,
                stage.tone === 'warning' && styles.tagTextoAtencao,
              ]}
            >
              {stage.badgeLabel}
            </Text>
          </View>
        ) : statusLabel ? (
          <Text style={styles.status}>{statusLabel}</Text>
        ) : null}
      </View>

      <View style={styles.topo}>
        {time ? <Text style={styles.hora}>{time}</Text> : <View style={styles.horaVazia} />}
        <View style={styles.identificacao}>
          <View style={styles.empresaLinha}>
            <Icon name="person" size={15} color={colors.inkSoft} />
            <Text style={styles.empresa} numberOfLines={1}>
              {companyName}
            </Text>
          </View>
          {supportingLabel ? <Text style={styles.apoio}>{supportingLabel}</Text> : null}
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

      {stops && stops.length > 0 ? (
        <View style={styles.rota}>
          <RouteTimeline stops={stops} compact />
        </View>
      ) : null}

      {children}

      {onPressDetails ? (
        <Pressable onPress={onPressDetails} hitSlop={8} style={styles.detalhes}>
          <Text style={styles.detalhesTexto}>Todos os detalhes</Text>
        </Pressable>
      ) : onPress ? (
        <Text style={[styles.detalhes, styles.detalhesTexto]}>Todos os detalhes</Text>
      ) : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  cartao: {
    paddingVertical: 9,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  linhaPedido: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 44,
  },
  numeroPedido: { color: colors.inkSoft, fontSize: 11, fontWeight: '700' },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  hora: { width: 38, paddingTop: 1, fontSize: 13, fontWeight: '800', color: colors.ink },
  horaVazia: { width: 38 },
  identificacao: { flex: 1, gap: 2 },
  empresaLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empresa: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  apoio: { paddingLeft: 21, fontSize: 10, fontWeight: '600', color: colors.inkMuted },
  valores: { minWidth: 58, alignItems: 'flex-end', gap: 1 },
  cronometro: {
    backgroundColor: colors.countdown,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginBottom: 2,
  },
  cronometroTexto: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  distancia: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  valor: { fontSize: 12, fontWeight: '800', color: colors.ink },
  status: { fontSize: 11, fontWeight: '800', color: colors.actionSoft },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.actionSoft,
    borderRadius: 6,
    backgroundColor: colors.actionSoftTint,
  },
  tagSucesso: { borderColor: colors.success, backgroundColor: colors.successSoft },
  tagAtencao: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  tagTexto: { fontSize: 10, fontWeight: '800', color: colors.actionSoft },
  tagTextoSucesso: { color: colors.success },
  tagTextoAtencao: { color: colors.warning },
  rota: { marginTop: 3, paddingLeft: 8 },
  detalhes: { alignSelf: 'flex-end' },
  detalhesTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
