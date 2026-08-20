import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthUser } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { ScreenHeader } from '../components/ScreenHeader';
import { authApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      const token = await session.getToken();
      if (!token) {
        if (mounted) setError('Sua sessão expirou. Entre novamente.');
        return;
      }
      try {
        const current = await authApi.me(token);
        if (mounted) setProfile(current);
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : 'Não foi possível carregar seu perfil.',
          );
        }
      }
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.screen,
        { backgroundColor: isDark ? colors.backgroundDark : colors.background },
      ]}
    >
      <ScreenHeader title="Perfil" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !profile ? (
          <Text style={[styles.muted, { color: muted }]}>Carregando perfil...</Text>
        ) : (
          <>
            <View style={styles.avatarRow}>
              <View style={[styles.avatar, { backgroundColor: border }]}>
                <Text style={[styles.avatarText, { color: text }]}>
                  {profile.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.name, { color: text }]}>{profile.name}</Text>
            </View>
            <View style={[styles.card, { borderColor: border }]}>
              <Text style={[styles.label, { color: muted }]}>E-mail</Text>
              <Text style={[styles.value, { color: text }]}>{profile.email}</Text>
              <Text style={[styles.label, { color: muted }]}>Perfil de acesso</Text>
              <Text style={[styles.value, { color: text }]}>Entregador</Text>
            </View>
            <View style={[styles.notice, { borderColor: border }]}>
              <Text style={[styles.noticeTitle, { color: text }]}>Dados cadastrais</Text>
              <Text style={[styles.muted, { color: muted }]}>
                Edição de telefone, documentos, foto e senha ainda não possui uma operação segura na
                API. Por isso esses controles não são exibidos como se salvassem alterações.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16 },
  avatarRow: { alignItems: 'center', gap: 8, marginVertical: 8 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 12, marginTop: 8 },
  value: { fontSize: 15, fontWeight: '600' },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, gap: 6 },
  noticeTitle: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
});
