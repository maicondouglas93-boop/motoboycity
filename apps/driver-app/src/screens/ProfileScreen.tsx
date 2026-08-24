import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthUser } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { FormField } from '../components/FormField';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { authApi } from '../lib/apiClient';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const token = await session.getToken();
    if (!token) {
      setError('Sua sessão expirou. Entre novamente.');
      return;
    }

    try {
      setProfile(await authApi.me(token));
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Não foi possível carregar seu perfil.',
      );
    }
  }, []);

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, [loadProfile]);

  const initial = profile?.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Perfil" icon="person" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityLabel}>Seu cadastro</Text>
            <Text style={styles.identityName} numberOfLines={2}>
              {profile?.name ?? 'Carregando perfil...'}
            </Text>
            <View style={styles.protectedPill}>
              <Icon name="shield" size={14} color={colors.success} />
              <Text style={styles.protectedText}>Dados protegidos</Text>
            </View>
          </View>
        </View>

        {error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar perfil novamente"
            style={styles.errorBox}
            onPress={() => loadProfile().catch(() => undefined)}
          >
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tocar para tentar novamente</Text>
          </Pressable>
        ) : null}

        {profile ? (
          <View style={styles.fields}>
            <FormField label="Nome" value={profile.name} editable={false} />
            <FormField label="E-mail" value={profile.email} editable={false} />
            <FormField label="Perfil de acesso" value="Entregador" editable={false} />
          </View>
        ) : null}

        <View style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Icon name="info" size={20} color={colors.actionSoft} />
          </View>
          <View style={styles.noticeText}>
            <Text style={styles.noticeTitle}>Atualização cadastral</Text>
            <Text style={styles.noticeDescription}>
              Nome, telefone, documentos, foto, senha e chave PIX ainda não possuem atualização
              segura pelo aplicativo. Solicite a alteração à administração para manter a auditoria
              do cadastro.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34, gap: 22 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 17 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
    borderWidth: 2,
    borderColor: '#d8e0ec',
  },
  avatarText: { color: colors.actionSoft, fontSize: 34, fontWeight: '800' },
  identityText: { flex: 1, gap: 4 },
  identityLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  identityName: { color: colors.ink, fontSize: 21, lineHeight: 27, fontWeight: '800' },
  protectedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.successSoft,
  },
  protectedText: { color: colors.success, fontSize: 11, fontWeight: '800' },
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
  fields: { gap: 17 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.actionSoftTint,
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
