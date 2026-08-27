import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DriverDispatchQueueResult } from '@motoboycity/types';
import { colors } from '../theme/colors';
import { Icon } from './Icon';

type Props = {
  visible: boolean;
  queue: DriverDispatchQueueResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
};

export function DriverQueueSheet({ visible, queue, loading, error, onClose, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  const position = queue?.currentPosition ?? null;
  const total = queue?.totalDrivers ?? 0;
  const hasQueue = position !== null && total > 0;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar fila de entregadores"
          style={styles.backdrop}
          onPress={onClose}
        />

        <View style={styles.panel}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Fila de Entregadores</Text>
              <Text style={styles.subtitle}>
                {total === 1 ? '1 entregador na fila' : `${total} entregadores na fila`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar fila"
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={10}
            >
              <Icon name="close" size={28} color={colors.inkSoft} />
            </Pressable>
          </View>

          {error && !queue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar a fila novamente"
              style={styles.errorCard}
              onPress={onRetry}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>Tocar para tentar novamente</Text>
            </Pressable>
          ) : (
            <View style={styles.queueCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Recolher fila geral' : 'Expandir fila geral'}
                disabled={!hasQueue || loading}
                style={styles.queueSummary}
                onPress={() => setExpanded((current) => !current)}
              >
                <View style={styles.positionBadge}>
                  <Text style={styles.positionBadgeText}>{position ? `#${position}` : '#--'}</Text>
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.queueName}>{queue?.queueName ?? 'Geral'}</Text>
                  <Text style={styles.positionText}>
                    {loading && !queue
                      ? 'Atualizando sua posição...'
                      : hasQueue
                        ? `Você está em ${position} de ${total}`
                        : 'Fique ativo para entrar na fila'}
                  </Text>
                </View>
                {hasQueue ? (
                  <Text style={styles.chevron}>{expanded ? '\u2303' : '\u2304'}</Text>
                ) : null}
              </Pressable>

              {expanded ? (
                <ScrollView
                  style={styles.driverList}
                  contentContainerStyle={styles.driverListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {queue?.drivers.map((driver) => (
                    <View
                      key={`${driver.position}:${driver.name}`}
                      style={[styles.driverRow, driver.isCurrentDriver && styles.currentDriverRow]}
                    >
                      <View
                        style={[
                          styles.smallBadge,
                          driver.isCurrentDriver && styles.currentDriverBadge,
                        ]}
                      >
                        <Text style={styles.smallBadgeText}>#{driver.position}</Text>
                      </View>
                      <Text
                        style={[
                          styles.driverName,
                          driver.isCurrentDriver && styles.currentDriverName,
                        ]}
                        numberOfLines={1}
                      >
                        {driver.name}
                        {driver.isCurrentDriver ? ' (Você)' : ''}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 19, 25, 0.5)',
  },
  panel: {
    minHeight: '46%',
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  handle: {
    alignSelf: 'center',
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.divider,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  headerText: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  subtitle: { color: colors.inkSoft, fontSize: 16 },
  closeButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  queueCard: {
    borderWidth: 1.5,
    borderColor: '#c9ced6',
    borderRadius: 20,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
  },
  queueSummary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  positionBadge: {
    width: 58,
    height: 58,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  positionBadgeText: { color: colors.actionText, fontSize: 21, fontWeight: '900' },
  summaryText: { flex: 1, gap: 3 },
  queueName: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  positionText: { color: colors.inkSoft, fontSize: 14 },
  chevron: { color: colors.inkMuted, fontSize: 24, fontWeight: '900' },
  driverList: { maxHeight: 310, marginTop: 12 },
  driverListContent: { gap: 8 },
  driverRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#eceff3',
  },
  currentDriverRow: { backgroundColor: '#d7dbe2' },
  smallBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6f7782',
  },
  currentDriverBadge: { backgroundColor: colors.action },
  smallBadgeText: { color: colors.actionText, fontSize: 16, fontWeight: '900' },
  driverName: { flex: 1, color: colors.inkSoft, fontSize: 16, fontWeight: '600' },
  currentDriverName: { color: colors.ink, fontWeight: '900' },
  errorCard: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  retryText: { color: colors.inkSoft, fontSize: 13, fontWeight: '600' },
});
