import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { RouteTimeline, type RouteStop } from './RouteTimeline';
import { colors } from '../theme/colors';

type PendingDeliveryCardProps = {
  displayNumber: number;
  time: string;
  companyName: string;
  serviceTypeName: string;
  distanceLabel: string;
  amountLabel: string;
  stops: ReadonlyArray<RouteStop>;
  batch: boolean;
  accepting: boolean;
  disabled: boolean;
  onAccept: () => void;
};

/** Card compacto para escolher entre varios pedidos livres na aba Pendentes. */
export function PendingDeliveryCard({
  displayNumber,
  time,
  companyName,
  serviceTypeName,
  distanceLabel,
  amountLabel,
  stops,
  batch,
  accepting,
  disabled,
  onAccept,
}: PendingDeliveryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Text style={styles.time}>{time}</Text>
          <Icon name="person" size={16} color={colors.inkSoft} />
          <Text style={styles.company} numberOfLines={1}>
            {companyName}
          </Text>
        </View>

        <View style={styles.values}>
          <Text style={styles.distance}>{distanceLabel}</Text>
          <Text style={styles.amount}>{amountLabel}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.order}>Pedido #{displayNumber}</Text>
        <Text style={styles.service} numberOfLines={1}>
          {serviceTypeName}
        </Text>
        {batch ? <Text style={styles.batch}>Lote</Text> : null}
      </View>

      <RouteTimeline stops={stops} compact />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aceitar pedido ${displayNumber}`}
        accessibilityState={{ disabled, busy: accepting }}
        disabled={disabled}
        onPress={onAccept}
        style={({ pressed }) => [
          styles.acceptButton,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.acceptLabel}>{accepting ? 'Aceitando...' : 'Aceitar pedido'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  company: { flex: 1, color: colors.inkSoft, fontSize: 13 },
  values: { alignItems: 'flex-end', gap: 1 },
  distance: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  amount: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  order: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  service: { flex: 1, color: colors.inkSoft, fontSize: 12, fontWeight: '600' },
  batch: {
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    color: colors.actionSoft,
    backgroundColor: colors.actionSoftTint,
    fontSize: 10,
    fontWeight: '800',
  },
  acceptButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.action,
  },
  acceptLabel: { color: colors.actionText, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.86 },
});
