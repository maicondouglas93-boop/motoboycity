import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockDriver, mockWallet } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletWithdraw'>;

export function WalletWithdrawScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Resgatar Saldo Disponível" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceValue}>{mockWallet.availableBalance}</Text>
        </View>
        <Text style={[styles.note, { color: colors.danger }]}>Taxa Administrativa: 3.0%</Text>
        <Text style={[styles.note, { color: muted }]}>Mínimo: R$ 100,00</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <FormField label="Conta" value="59765" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Agência" value="3137" />
          </View>
        </View>
        <FormField label="Banco" value="Sicoob" />
        <FormField label="Nome Titular" value={mockDriver.name} />
        <FormField label="Chave Pix" value="33999329978" />
        <FormField label="Valor a Resgatar" placeholder="R$ 0,00" keyboardType="numeric" />

        <PrimaryButton label="Solicitar Saque" style={styles.submit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  balanceBox: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
  },
  note: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  submit: {
    marginTop: 8,
  },
});
