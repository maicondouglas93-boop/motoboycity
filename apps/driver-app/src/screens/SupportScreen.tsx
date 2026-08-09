import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NotSpecifiedNotice } from '../components/NotSpecifiedNotice';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Support'>;

export function SupportScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Suporte" onBack={() => navigation.goBack()} />
      <NotSpecifiedNotice screenName="Suporte" />
    </SafeAreaView>
  );
}
