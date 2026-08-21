import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { API_BASE_URL, APP_ENV, APP_ENV_LABEL } from '../lib/config';
import { DRIVER_APP_VERSION } from '../lib/appVersion';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;

  return (
    <SafeAreaView
      style={[
        styles.screen,
        { backgroundColor: isDark ? colors.backgroundDark : colors.background },
      ]}
    >
      <ScreenHeader title="Ajustes" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: text }]}>Configuracoes do aplicativo</Text>
        <View style={[styles.notice, { borderColor: border }]}>
          <Text style={[styles.noticeTitle, { color: text }]}>Nenhum ajuste disponivel ainda</Text>
          <Text style={[styles.noticeText, { color: muted }]}>
            Mapa padrao, sobreposicao, alertas e tela sempre ligada ainda nao possuem uma operacao
            persistida ou um recurso nativo integrado. Por isso esses controles nao sao exibidos
            como se alterassem o funcionamento do aplicativo.
          </Text>
        </View>
        <View style={[styles.notice, { borderColor: border }]}>
          <Text style={[styles.noticeTitle, { color: text }]}>Disponibilidade</Text>
          <Text style={[styles.noticeText, { color: muted }]}>
            Use o seletor na tela inicial para ficar disponivel ou indisponivel para receber
            ofertas. Esse e o unico ajuste operacional atualmente conectado a API.
          </Text>
        </View>
        <Text style={[styles.sectionTitle, { color: text }]}>Diagnostico</Text>
        <View style={[styles.notice, { borderColor: border }]}>
          <View style={styles.diagnosticRow}>
            <Text style={[styles.diagnosticLabel, { color: muted }]}>Ambiente</Text>
            <Text style={[styles.diagnosticValue, { color: text }]}>
              {APP_ENV_LABEL[APP_ENV] ?? APP_ENV}
            </Text>
          </View>
          <View style={styles.diagnosticRow}>
            <Text style={[styles.diagnosticLabel, { color: muted }]}>Servidor</Text>
            <Text style={[styles.diagnosticValue, { color: text }]} numberOfLines={1}>
              {API_BASE_URL}
            </Text>
          </View>
          <View style={styles.diagnosticRow}>
            <Text style={[styles.diagnosticLabel, { color: muted }]}>Versao</Text>
            <Text style={[styles.diagnosticValue, { color: text }]}>{DRIVER_APP_VERSION}</Text>
          </View>
          <Text style={[styles.noticeText, { color: muted }]}>
            Informe estes dados ao acionar o suporte.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 12 },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  noticeTitle: { fontSize: 14, fontWeight: '700' },
  noticeText: { fontSize: 13, lineHeight: 19 },
  diagnosticRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  diagnosticLabel: { fontSize: 13 },
  diagnosticValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
