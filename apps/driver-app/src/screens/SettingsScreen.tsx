import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { API_BASE_URL, APP_ENV, APP_ENV_LABEL } from '../lib/config';
import { DRIVER_APP_VERSION } from '../lib/appVersion';
import {
  abrirAjusteDeTelaCheia,
  consultarApresentacaoNativa,
  type NativeOfferPresentationStatus,
} from '../lib/offerSession';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [offerPresentation, setOfferPresentation] = useState<NativeOfferPresentationStatus | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      consultarApresentacaoNativa()
        .then((status) => {
          if (active) setOfferPresentation(status);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  async function openSystemSettings() {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('Ajustes indisponíveis', 'Não foi possível abrir os ajustes deste aparelho.');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Ajustes" icon="settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Permissões do aparelho</Text>
        <Card style={styles.card}>
          <SettingRow
            icon="pin"
            title="Localização"
            description="Necessária para ficar ativo, assumir pedidos e registrar o trajeto da entrega."
            status="Gerenciada pelo sistema"
          />
          <View style={styles.divider} />
          <SettingRow
            icon="clock"
            title="Notificações"
            description="Usadas para avisar sobre ofertas e alterações de uma corrida em andamento."
            status={
              offerPresentation?.notificationsEnabled === false
                ? 'Notificações bloqueadas'
                : 'Notificações autorizadas'
            }
            tone={offerPresentation?.notificationsEnabled === false ? 'warning' : 'success'}
          />
          {Platform.OS === 'android' && (
            <>
              <View style={styles.divider} />
              <SettingRow
                icon="info"
                title="Oferta sobre a tela bloqueada"
                description={
                  offerPresentation?.fullScreenNeedsManualGrant
                    ? 'No Android 14 ou mais recente, esta autorização é separada. Sem ela, a oferta continua chegando como uma faixa expandida.'
                    : 'Acende a tela e mostra o cartão da oferta quando o aplicativo está em segundo plano.'
                }
                status={
                  offerPresentation?.fullScreenGranted
                    ? 'Tela cheia autorizada'
                    : 'Autorização necessária'
                }
                tone={offerPresentation?.fullScreenGranted ? 'success' : 'warning'}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Configurar ofertas em tela cheia"
                onPress={() => abrirAjusteDeTelaCheia().catch(() => undefined)}
                style={({ pressed }) => [
                  styles.permissionButton,
                  pressed && styles.systemButtonPressed,
                ]}
              >
                <Text style={styles.permissionButtonText}>Configurar oferta em tela cheia</Text>
                <Icon name="chevron" size={20} color={colors.action} />
              </Pressable>
            </>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir ajustes do aparelho"
            onPress={() => openSystemSettings().catch(() => undefined)}
            style={({ pressed }) => [styles.systemButton, pressed && styles.systemButtonPressed]}
          >
            <Text style={styles.systemButtonText}>Abrir ajustes do aparelho</Text>
            <Icon name="chevron" size={20} color={colors.surface} />
          </Pressable>
        </Card>

        <Text style={styles.sectionTitle}>Operação</Text>
        <Card style={styles.card}>
          <SettingRow
            icon="shield"
            title="Disponibilidade"
            description="O seletor Ativo/Inativo permanece na tela inicial para evitar mudanças acidentais."
            status="Conectada à API"
            tone="success"
          />
          <View style={styles.divider} />
          <SettingRow
            icon="pin"
            title="Mapa da operação"
            description="GPS e rastreamento funcionam; a visualização nativa do mapa ainda depende da chave mobile do provedor."
            status="Configuração pendente"
            tone="warning"
          />
        </Card>

        <Text style={styles.sectionTitle}>Sobre o aplicativo</Text>
        <Card style={styles.card}>
          <DiagnosticRow label="Ambiente" value={APP_ENV_LABEL[APP_ENV] ?? APP_ENV} />
          <View style={styles.divider} />
          <DiagnosticRow label="Versão" value={DRIVER_APP_VERSION} />
          <View style={styles.divider} />
          <DiagnosticRow label="Servidor" value={API_BASE_URL} compact />
        </Card>

        <View style={styles.notice}>
          <Icon name="info" size={19} color={colors.actionSoft} />
          <Text style={styles.noticeText}>
            O cartão de oferta já usa integração Android real. Som personalizado, nomes no mapa e
            outros controles só aparecerão quando houver implementação nativa correspondente.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  title,
  description,
  status,
  tone = 'neutral',
}: {
  icon: IconName;
  title: string;
  description: string;
  status: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Icon name={icon} size={21} color={colors.actionSoft} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
        <View
          style={[
            styles.statusPill,
            tone === 'success' && styles.statusSuccess,
            tone === 'warning' && styles.statusWarning,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              tone === 'success' && styles.statusDotSuccess,
              tone === 'warning' && styles.statusDotWarning,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              tone === 'success' && styles.statusTextSuccess,
              tone === 'warning' && styles.statusTextWarning,
            ]}
          >
            {status}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DiagnosticRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={[styles.diagnosticValue, compact && styles.diagnosticCompact]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 34, gap: 13 },
  sectionTitle: { marginTop: 8, color: colors.ink, fontSize: 18, fontWeight: '800' },
  card: { padding: 0, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
  },
  settingText: { flex: 1, gap: 4 },
  settingTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  settingDescription: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  statusSuccess: { backgroundColor: colors.successSoft },
  statusWarning: { backgroundColor: colors.warningSoft },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inkMuted },
  statusDotSuccess: { backgroundColor: colors.success },
  statusDotWarning: { backgroundColor: colors.warning },
  statusText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  statusTextSuccess: { color: colors.success },
  statusTextWarning: { color: '#a76a00' },
  divider: { height: 1, backgroundColor: colors.divider },
  systemButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 14,
    borderRadius: 11,
    backgroundColor: colors.action,
  },
  systemButtonPressed: { opacity: 0.86 },
  systemButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  permissionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.action,
    backgroundColor: colors.actionSoftTint,
  },
  permissionButtonText: { color: colors.action, fontSize: 13, fontWeight: '800' },
  diagnosticRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  diagnosticLabel: { flex: 1, color: colors.inkSoft, fontSize: 13, fontWeight: '600' },
  diagnosticValue: { color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  diagnosticCompact: { flex: 1, fontSize: 11 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 13,
    backgroundColor: colors.actionSoftTint,
  },
  noticeText: { flex: 1, color: colors.inkSoft, fontSize: 11, lineHeight: 17 },
});
