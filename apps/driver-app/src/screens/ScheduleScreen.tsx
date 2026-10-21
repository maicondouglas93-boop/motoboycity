import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DriverScheduleView } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { diaDaSemana } from '@motoboycity/validation';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { driverScheduleApi } from '../lib/apiClient';
import { todayInSaoPaulo } from '../lib/calendar';
import { session } from '../lib/session';
import { linhasDaEscala, resumoDaSituacao } from '../lib/workSchedule';
import type { RootStackParamList } from '../navigation/types';
import { useDispatchStore } from '../store/dispatchStore';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Schedule'>;

/**
 * A escala do motoboy, so para ver: quem monta e a central, no ADM.
 *
 * Fora dos turnos o servidor nao deixa ele ficar Ativo e nao manda pedido
 * novo. Esta tela existe para ele saber disso ANTES de tentar, e para saber
 * quando pode.
 */
export function ScheduleScreen({ navigation }: Props) {
  const [view, setView] = useState<DriverScheduleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const setWorkSchedule = useDispatchStore((state) => state.setWorkSchedule);

  const load = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente.');
      return;
    }

    try {
      const atual = await driverScheduleApi.get(token);
      setView(atual);
      // O aviso da Home le o mesmo status; aproveita a leitura fresca.
      setWorkSchedule(atual.status);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar sua escala.',
      );
    }
  }, [setWorkSchedule]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const escala = view?.schedule ?? null;
  const resumo = view ? resumoDaSituacao(escala, view.status) : null;
  const linhas = escala ? linhasDaEscala(escala, diaDaSemana(todayInSaoPaulo())) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Escala" icon="calendar" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refresh().catch(() => undefined)} />
        }
      >
        {!view && !error ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.actionSoft} />
          </View>
        ) : null}

        {error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar a escala novamente"
            style={styles.errorBox}
            onPress={() => load().catch(() => undefined)}
          >
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tocar para tentar novamente</Text>
          </Pressable>
        ) : null}

        {resumo ? (
          <View
            accessibilityRole="summary"
            style={[
              styles.status,
              resumo.tom === 'no-turno' && styles.statusNoTurno,
              resumo.tom === 'fora' && styles.statusFora,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                resumo.tom === 'no-turno' && styles.statusDotNoTurno,
                resumo.tom === 'fora' && styles.statusDotFora,
              ]}
            />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{resumo.titulo}</Text>
              <Text style={styles.statusDescription}>{resumo.texto}</Text>
            </View>
          </View>
        ) : null}

        {linhas.length > 0 ? (
          <View style={styles.week}>
            {linhas.map((linha, indice) => (
              <View
                key={linha.weekday}
                accessible
                accessibilityLabel={`${linha.dia}${linha.hoje ? ', hoje' : ''}: ${
                  linha.turnos.length > 0 ? linha.turnos.join(' e ') : 'folga'
                }`}
                style={[styles.day, indice > 0 && styles.dayDivider, linha.hoje && styles.dayToday]}
              >
                <View style={styles.dayName}>
                  <Text style={[styles.dayLabel, linha.hoje && styles.dayLabelToday]}>
                    {linha.dia}
                  </Text>
                  {linha.hoje ? <Text style={styles.todayPill}>Hoje</Text> : null}
                </View>
                <View style={styles.shifts}>
                  {linha.turnos.length > 0 ? (
                    linha.turnos.map((turno) => (
                      <Text key={turno} style={styles.shift}>
                        {turno}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.dayOff}>Folga</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {view ? (
          <View style={styles.notice}>
            <View style={styles.noticeIcon}>
              <Icon name="info" size={20} color={colors.actionSoft} />
            </View>
            <View style={styles.noticeText}>
              <Text style={styles.noticeTitle}>Quem monta a escala é a central</Text>
              <Text style={styles.noticeDescription}>
                {escala
                  ? 'Dia sem turno é folga. Turno que passa da meia-noite aparece no dia em que começa. Para trocar um turno, fale com a central.'
                  : 'Se a central montar uma escala para você, ela aparece aqui.'}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34, gap: 18 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  errorBox: {
    gap: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 13,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  retryText: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },
  status: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.actionSoftTint,
  },
  statusNoTurno: { backgroundColor: colors.successSoft },
  statusFora: { backgroundColor: colors.warningSoft },
  statusDot: {
    width: 12,
    height: 12,
    marginTop: 5,
    borderRadius: 6,
    backgroundColor: colors.actionSoft,
  },
  statusDotNoTurno: { backgroundColor: colors.success },
  statusDotFora: { backgroundColor: colors.warning },
  statusText: { flex: 1, gap: 4 },
  statusTitle: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  statusDescription: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  week: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    overflow: 'hidden',
  },
  day: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  dayToday: { backgroundColor: colors.actionSoftTint },
  dayName: { width: 96, gap: 4 },
  dayLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  dayLabelToday: { fontWeight: '800' },
  todayPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9,
    overflow: 'hidden',
    color: colors.surface,
    backgroundColor: colors.actionSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  shifts: { flex: 1, gap: 4 },
  shift: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  dayOff: { color: colors.inkMuted, fontSize: 15 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  noticeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  noticeText: { flex: 1, gap: 4 },
  noticeTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  noticeDescription: { color: colors.inkSoft, fontSize: 12, lineHeight: 19 },
});
