import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@motoboycity/api-client';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deliveryOffersApi } from '../lib/apiClient';
import { session } from '../lib/session';
import { useDispatchStore } from '../store/dispatchStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingOffer'>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function IncomingOfferScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const offer = useDispatchStore((state) => state.incomingOffer);
  const setIncomingOffer = useDispatchStore((state) => state.setIncomingOffer);
  const [secondsLeft, setSecondsLeft] = useState(offer?.expiresInSeconds ?? 0);
  const [status, setStatus] = useState<'idle' | 'accepting' | 'declining'>('idle');

  // A oferta some da store (aceita/recusada/expirada/cancelada em outra
  // aba, ou o timer local zerou) — sai da tela em vez de mostrar em branco.
  useEffect(() => {
    if (!offer) {
      navigation.goBack();
    }
  }, [offer, navigation]);

  useEffect(() => {
    if (!offer) return;
    setSecondsLeft(offer.expiresInSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(interval);
          setIncomingOffer(null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [offer, setIncomingOffer]);

  if (!offer) {
    return null;
  }

  async function respond(action: 'accept' | 'decline') {
    if (!offer) return;
    const token = await session.getToken();
    if (!token) return;

    setStatus(action === 'accept' ? 'accepting' : 'declining');
    try {
      if (action === 'accept') {
        await deliveryOffersApi.accept(token, offer.offerId);
      } else {
        await deliveryOffersApi.decline(token, offer.offerId);
      }
      setIncomingOffer(null);
    } catch (error) {
      setStatus('idle');
      Alert.alert(
        'Ops',
        error instanceof ApiError ? error.message : 'Não foi possível responder a esta oferta.',
      );
    }
  }

  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const background = isDark ? colors.backgroundDark : colors.background;
  const busy = status !== 'idle';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.content}>
        <Text style={[styles.countdown, { color: colors.primary }]}>{secondsLeft}s</Text>
        <Text style={[styles.title, { color: text }]}>Novo pedido #{offer.displayNumber}</Text>

        <View style={styles.detailRow}>
          <Text style={{ color: muted }}>Valor</Text>
          <Text style={[styles.value, { color: text }]}>
            {currencyFormatter.format(offer.driverValue)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={{ color: muted }}>Distância</Text>
          <Text style={[styles.value, { color: text }]}>
            {offer.distanceKm !== null ? `${offer.distanceKm.toFixed(1)} km` : '—'}
          </Text>
        </View>
        {offer.requiresReturn && (
          <Text style={[styles.badge, { color: colors.warning }]}>Com retorno ao ponto de coleta</Text>
        )}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={status === 'declining' ? 'Recusando...' : 'Recusar'}
          variant="outline"
          onPress={busy ? undefined : () => respond('decline')}
        />
        <PrimaryButton
          label={status === 'accepting' ? 'Aceitando...' : 'Aceitar'}
          onPress={busy ? undefined : () => respond('accept')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  content: {
    gap: 16,
    alignItems: 'center',
    marginTop: 48,
  },
  countdown: {
    fontSize: 40,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  value: {
    fontWeight: '600',
  },
  badge: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
});
