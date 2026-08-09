import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockSettings } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function SettingRow({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
}) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: text, fontSize: 13 }}>{label}</Text>
        {description && <Text style={{ color: muted, fontSize: 11 }}>{description}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  return (
    <View style={styles.row}>
      <Text style={{ color: text, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: muted, fontSize: 13 }}>{value} ▾</Text>
    </View>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  const [overlayMinimized, setOverlayMinimized] = useState(mockSettings.overlayOnMinimized);
  const [overlayOpen, setOverlayOpen] = useState(mockSettings.overlayOnOpen);
  const [keepScreenOn, setKeepScreenOn] = useState(mockSettings.keepScreenOn);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Ajustes" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: text }]}>Sobreposição</Text>
        <SettingRow
          label="Habilitar com app minimizado"
          value={overlayMinimized}
          onValueChange={setOverlayMinimized}
        />
        <SettingRow
          label="Habilitar com app aberto"
          value={overlayOpen}
          onValueChange={setOverlayOpen}
        />
        <Text style={{ color: muted, fontSize: 12 }}>
          Tamanho da sobreposição: {mockSettings.overlaySize}
        </Text>

        <Text style={[styles.sectionTitle, { color: text }]}>Tela</Text>
        <SettingRow
          label="Manter tela ligada"
          value={keepScreenOn}
          onValueChange={setKeepScreenOn}
          description="A tela não apaga sozinha com o app aberto. Consome mais bateria."
        />

        <ValueRow label="Mapa padrão" value={mockSettings.defaultMap} />
        <ValueRow label="Som de Notificação" value={mockSettings.notificationSound} />

        <Text style={[styles.sectionTitle, { color: text }]}>Outras Opções</Text>
        <Text style={{ color: colors.primary, fontSize: 13 }}>📄 Termos de Uso</Text>

        <Text style={{ color: muted, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          Versão {mockSettings.appVersion}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
});
