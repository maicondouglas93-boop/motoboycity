import { View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AvailableOrders'>;

export function AvailableOrdersScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Disponíveis" onBack={() => navigation.goBack()} />
      <View style={{ flex: 1 }}>
        <EmptyState message="Você não tem nenhuma entrega" />
      </View>
    </SafeAreaView>
  );
}
