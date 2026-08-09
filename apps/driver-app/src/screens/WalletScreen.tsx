import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockWallet, mockWalletTransactions } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

export function WalletScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Carteira" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.banner]}>
          <Text style={styles.bannerText}>
            Pagamentos de solicitações de saque são processados na segunda-feira!
          </Text>
        </View>

        <View style={styles.balanceRow}>
          <Card style={styles.balanceCard}>
            <Text style={{ color: muted, fontSize: 12 }}>Saldo disponível</Text>
            <Text style={[styles.balanceValue, { color: text }]}>
              {mockWallet.availableBalance}
            </Text>
          </Card>
          <Card style={styles.balanceCard}>
            <Text style={{ color: muted, fontSize: 12 }}>Saldo Bloqueado</Text>
            <Text style={[styles.balanceValue, { color: colors.danger }]}>
              {mockWallet.blockedBalance}
            </Text>
          </Card>
        </View>

        <PrimaryButton
          label="Solicitar Saque"
          onPress={() => navigation.navigate('WalletWithdraw')}
        />
        <PrimaryButton
          label="Solicitar Antecipação"
          variant="outline"
          onPress={() => navigation.navigate('WalletAdvance')}
        />

        <Text style={[styles.sectionTitle, { color: text }]}>Histórico de Transações</Text>
        {mockWalletTransactions.map((transaction) => (
          <Card key={transaction.id}>
            <View style={styles.transactionRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: text, fontSize: 13 }}>{transaction.description}</Text>
                <Text style={{ color: muted, fontSize: 11 }}>{transaction.date}</Text>
                <Text style={{ color: muted, fontSize: 11 }}>{transaction.releaseDate}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge label={transaction.status} tone="warning" />
                <Text style={{ color: text, fontWeight: '600' }}>🔒 {transaction.value}</Text>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  banner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
  },
  bannerText: {
    fontSize: 12,
    color: colors.warning,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  balanceCard: {
    flex: 1,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
