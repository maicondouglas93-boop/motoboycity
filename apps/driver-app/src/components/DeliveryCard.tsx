import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { RouteTimeline, type RouteStop } from './RouteTimeline';
import { colors } from '../theme/colors';

export type DeliveryCardProps = {
  /** Hora em que o pedido entrou, no formato curto (`14:09`). */
  time?: string;
  companyName: string;
  /** Texto do estado do pedido, como "Faturado" ou "Em entrega". */
  statusLabel?: string;
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
  companyName,
  statusLabel,
  distanceLabel,
  amountLabel,
  countdownLabel,
  stops,
  onPressDetails,
  onPress,
  children,
}: DeliveryCardProps) {
  const Container = onPress ? Pressable : View;

  return (
    <Container style={styles.cartao} onPress={onPress}>
      <View style={styles.topo}>
        <View style={styles.identificacao}>
          {time && <Text style={styles.hora}>{time}</Text>}
          <Icon name="person" size={20} color={colors.inkSoft} />
          <Text style={styles.empresa} numberOfLines={1}>
            {companyName}
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

      {statusLabel && <Text style={styles.status}>{statusLabel}</Text>}

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
    paddingVertical: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  identificacao: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  hora: { fontSize: 17, fontWeight: '700', color: colors.ink },
  empresa: { flex: 1, fontSize: 16, color: colors.inkSoft },
  valores: { alignItems: 'flex-end', gap: 2 },
  cronometro: {
    backgroundColor: colors.countdown,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 4,
  },
  cronometroTexto: { color: colors.surface, fontSize: 17, fontWeight: '600' },
  distancia: { fontSize: 19, color: colors.ink },
  valor: { fontSize: 19, color: colors.ink },
  status: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rota: { marginTop: 6 },
  detalhes: { alignSelf: 'flex-end' },
  detalhesTexto: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
