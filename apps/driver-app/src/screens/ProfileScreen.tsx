import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthUser } from '@motoboycity/types';
import { ApiError } from '@motoboycity/api-client';
import { launchImageLibrary } from 'react-native-image-picker';
import { FormField } from '../components/FormField';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { authApi } from '../lib/apiClient';
import { getDriverProfile, setDriverProfile } from '../lib/driverProfileCache';
import { session } from '../lib/session';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const loadProfile = useCallback(async (force = false) => {
    const token = await session.getToken();
    if (!token) {
      setProfileError('Sua sessão expirou. Entre novamente.');
      return;
    }

    try {
      setProfile(await getDriverProfile(token, { force }));
      setProfileError(null);
    } catch (loadError) {
      setProfileError(
        loadError instanceof ApiError ? loadError.message : 'Não foi possível carregar seu perfil.',
      );
    }
  }, []);

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, [loadProfile]);

  const initial = profile?.name.trim().charAt(0).toUpperCase() || '?';
  const visibleAvatarUrl =
    profile?.avatarUrl && profile.avatarUrl !== failedAvatarUrl ? profile.avatarUrl : null;

  async function chooseAvatar() {
    setAvatarError(null);

    let selection;
    try {
      selection = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      });
    } catch {
      setAvatarError('Não foi possível abrir suas fotos. Tente novamente.');
      return;
    }

    if (selection.didCancel) return;
    if (selection.errorCode) {
      setAvatarError(selection.errorMessage ?? 'Não foi possível abrir suas fotos.');
      return;
    }

    const asset = selection.assets?.[0];
    if (!asset?.uri) {
      setAvatarError('A imagem selecionada não pode ser lida.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setAvatarError('Escolha uma imagem com no máximo 5 MB.');
      return;
    }

    const token = await session.getToken().catch(() => null);
    if (!token) {
      setAvatarError('Sua sessão expirou. Entre novamente.');
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: asset.type ?? 'image/jpeg',
      name: asset.fileName ?? 'foto-perfil.jpg',
    } as unknown as Blob);

    setUploadingAvatar(true);
    try {
      const updatedProfile = await authApi.uploadAvatar(token, formData);
      setDriverProfile(token, updatedProfile);
      setProfile(updatedProfile);
      setFailedAvatarUrl(null);
    } catch (uploadError) {
      setAvatarError(
        uploadError instanceof ApiError
          ? uploadError.message
          : 'Não foi possível atualizar sua foto.',
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  function openAvatarPicker() {
    chooseAvatar().catch(() => {
      setAvatarError('Não foi possível abrir suas fotos. Tente novamente.');
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Perfil" icon="person" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alterar foto do perfil"
            disabled={uploadingAvatar}
            style={styles.avatarButton}
            onPress={openAvatarPicker}
          >
            <View style={styles.avatar}>
              {visibleAvatarUrl ? (
                <Image
                  source={{ uri: visibleAvatarUrl }}
                  style={styles.avatarImage}
                  onError={() => setFailedAvatarUrl(visibleAvatarUrl)}
                />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={colors.surface} />
                </View>
              ) : null}
            </View>
            <Text style={styles.changePhotoText}>
              {uploadingAvatar ? 'Enviando...' : 'Trocar foto'}
            </Text>
          </Pressable>
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

        {avatarError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Escolher outra foto do perfil"
            disabled={uploadingAvatar}
            style={styles.errorBox}
            onPress={openAvatarPicker}
          >
            <Text style={styles.errorText}>{avatarError}</Text>
            <Text style={styles.retryText}>Tocar para escolher outra foto</Text>
          </Pressable>
        ) : null}

        {profileError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar perfil novamente"
            style={styles.errorBox}
            onPress={() => loadProfile(true).catch(() => undefined)}
          >
            <Text style={styles.errorText}>{profileError}</Text>
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
              Nome, telefone, documentos, senha e chave PIX ainda não possuem atualização segura
              pelo aplicativo. Solicite a alteração à administração para manter a auditoria do
              cadastro.
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
  avatarButton: { alignItems: 'center', gap: 6 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoftTint,
    borderWidth: 2,
    borderColor: '#d8e0ec',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarLoading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 36, 48, 0.58)',
  },
  avatarText: { color: colors.actionSoft, fontSize: 34, fontWeight: '800' },
  changePhotoText: { color: colors.actionSoft, fontSize: 12, fontWeight: '800' },
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
