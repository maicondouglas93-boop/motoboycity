import { Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyShifts'>;

export function MyShiftsScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const muted = isDark ? colors.mutedDark : colors.muted;
  const text = isDark ? colors.textDark : colors.text;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Minhas Escalas" onBack={() => navigation.goBack()} />
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: text, fontSize: 13 }}>Hoje ▾</Text>
      </View>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}
      >
        <Text style={{ fontSize: 32 }}>🗓️</Text>
        <Text style={{ color: text, fontWeight: '600' }}>Nenhuma escala aceita</Text>
        <Text style={{ color: muted, fontSize: 12, textAlign: 'center' }}>
          Você ainda não aceitou nenhuma escala.
        </Text>
      </View>
    </SafeAreaView>
  );
}
