import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  compareMonths,
  initialMonth,
  isOutsideLimits,
  monthOf,
  monthWeeks,
  shiftMonth,
  spokenDate,
  todayInSaoPaulo,
  type CalendarMonth,
} from '../lib/calendar';
import { colors } from '../theme/colors';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  visible: boolean;
  title: string;
  /** Data marcada, `AAAA-MM-DD`; vazio quando ainda nao ha escolha. */
  value: string;
  minDate?: string;
  maxDate?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
};

/**
 * Calendario para escolher um dia, sem teclado.
 *
 * Escrito aqui em vez de vir de biblioteca: o seletor nativo do Android e
 * dependencia NATIVA, com rebuild do Gradle e risco de versao a cada
 * atualizacao do React Native — o mesmo motivo de os icones sairem de
 * `Icon.tsx`. Um mes em grade de 7 colunas resolve o que o motoboy precisa.
 */
export function DatePickerModal({
  visible,
  title,
  value,
  minDate,
  maxDate,
  onSelect,
  onClose,
}: Props) {
  const today = todayInSaoPaulo();
  const [shown, setShown] = useState<CalendarMonth>(() => initialMonth(value, maxDate, today));

  // Cada abertura comeca no mes da data marcada, nao onde a anterior parou.
  useEffect(() => {
    if (visible) setShown(initialMonth(value, maxDate, today));
  }, [visible, value, maxDate, today]);

  const minMonth = minDate ? monthOf(minDate) : null;
  const maxMonth = maxDate ? monthOf(maxDate) : null;
  const canGoBack = !minMonth || compareMonths(shown, minMonth) > 0;
  const canGoForward = !maxMonth || compareMonths(shown, maxMonth) < 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Irmao do cartao, nao pai: pai acessivel agruparia os dias num botao so no TalkBack. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar calendário"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              accessibilityState={{ disabled: !canGoBack }}
              disabled={!canGoBack}
              hitSlop={8}
              onPress={() => setShown((current) => shiftMonth(current, -1))}
              style={({ pressed }) => [
                styles.monthButton,
                pressed && styles.pressed,
                !canGoBack && styles.hidden,
              ]}
            >
              <Text style={styles.monthArrow}>{'‹'}</Text>
            </Pressable>
            <Text style={styles.monthTitle} accessibilityRole="header">
              {MONTH_NAMES[shown.month]} de {shown.year}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              accessibilityState={{ disabled: !canGoForward }}
              disabled={!canGoForward}
              hitSlop={8}
              onPress={() => setShown((current) => shiftMonth(current, 1))}
              style={({ pressed }) => [
                styles.monthButton,
                pressed && styles.pressed,
                !canGoForward && styles.hidden,
              ]}
            >
              <Text style={styles.monthArrow}>{'›'}</Text>
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text key={index} style={styles.weekday}>
                {initial}
              </Text>
            ))}
          </View>

          {monthWeeks(shown).map((week, weekIndex) => (
            <View key={weekIndex} style={styles.week}>
              {week.map((date, dayIndex) => {
                if (!date) return <View key={dayIndex} style={styles.dayCell} />;

                const selected = date === value;
                const isToday = date === today;
                const blocked = isOutsideLimits(date, minDate, maxDate);
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={spokenDate(date)}
                    accessibilityState={{ selected, disabled: blocked }}
                    disabled={blocked}
                    onPress={() => onSelect(date)}
                    style={styles.dayCell}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.dayCircle,
                          isToday && styles.today,
                          pressed && styles.dayPressed,
                          selected && styles.selected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            blocked && styles.blockedText,
                            selected && styles.selectedText,
                          ]}
                        >
                          {Number(date.slice(8, 10))}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <PrimaryButton
            label="Cancelar"
            variant="outline"
            style={styles.cancel}
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const DAY_SIZE = 40;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 18,
    gap: 6,
    backgroundColor: colors.surface,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.actionSoftTint,
  },
  monthArrow: { color: colors.ink, fontSize: 28, lineHeight: 32, fontWeight: '700' },
  monthTitle: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    paddingVertical: 4,
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  dayCell: { flex: 1, height: DAY_SIZE + 4, alignItems: 'center', justifyContent: 'center' },
  dayCircle: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DAY_SIZE / 2,
  },
  today: { borderWidth: 1.5, borderColor: colors.actionSoft },
  dayPressed: { backgroundColor: colors.track },
  selected: { borderWidth: 0, backgroundColor: colors.action },
  dayText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  blockedText: { color: colors.inkMuted, opacity: 0.45 },
  selectedText: { color: colors.actionText, opacity: 1 },
  cancel: { marginTop: 8 },
  pressed: { opacity: 0.7 },
  hidden: { opacity: 0 },
});
