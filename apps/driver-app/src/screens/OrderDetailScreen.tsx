import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockOrderDetail } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

export function OrderDetailScreen({ navigation, route }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const orderId = route.params?.orderId ?? mockOrderDetail.id;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title={`Pedido #${orderId}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: muted, fontSize: 12 }}>{mockOrderDetail.date}</Text>
        <View style={styles.statusRow}>
          <Badge label={mockOrderDetail.status} tone="success" />
          <Text style={styles.brand}>motoboy</Text>
        </View>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Valores</Text>
          <View style={styles.line}>
            <Text style={{ color: muted, fontSize: 13 }}>Valor do Entregador</Text>
            <Text style={{ color: text, fontWeight: '600' }}>{mockOrderDetail.driverValue}</Text>
          </View>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Método de Pagamento</Text>
          <Text style={{ color: text, fontSize: 13 }}>{mockOrderDetail.paymentMethod}</Text>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Endereços</Text>
          <Text style={{ color: text, fontSize: 13 }}>✓ {mockOrderDetail.address}</Text>
          <Text style={{ color: muted, fontSize: 12 }}>
            {mockOrderDetail.deliveriesCount} entrega realizada
          </Text>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: text }]}>Cliente</Text>
          <Text style={{ color: text, fontSize: 13 }}>{mockOrderDetail.customerName}</Text>
          <Text style={{ color: colors.primary, fontSize: 13 }}>
            {mockOrderDetail.customerPhone}
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
