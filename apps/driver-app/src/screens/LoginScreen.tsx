import { useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { loginSchema } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { authApi } from '../lib/apiClient';
import { setDriverProfile } from '../lib/driverProfileCache';
import { session } from '../lib/session';
import { resetSessionExpiry } from '../lib/sessionExpiry';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');

  async function handleSubmit() {
    setFormError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setStatus('submitting');
    try {
      const loginResult = await authApi.login(result.data);
      if (loginResult.user.type !== 'DRIVER') {
        setStatus('idle');
        setFormError('Esta conta não é de um entregador.');
        return;
      }
      await session.setToken(loginResult.accessToken, loginResult.user.id);
      // Credencial nova: uma expiracao futura precisa poder disparar de novo.
      resetSessionExpiry();
      setDriverProfile(loginResult.accessToken, loginResult.user);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      setStatus('idle');
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível entrar.');
    }
  }

  return (
    <SafeAreaView style={isDark ? styles.safeAreaDark : styles.safeAreaLight}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: text }]}>MOTOboyCity</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Entrar como entregador</Text>
        </View>

        <FormField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCorrect={false}
          error={fieldErrors.email}
        />
        <FormField
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={fieldErrors.password}
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <PrimaryButton
          label={status === 'submitting' ? 'Entrando...' : 'Entrar'}
          onPress={status === 'submitting' ? undefined : handleSubmit}
          style={styles.submitButton}
        />

        <Text
          style={[styles.registerLink, { color: isDark ? colors.primaryDark : colors.primary }]}
          onPress={() => navigation.navigate('Register')}
        >
          Ainda não tem conta? Criar cadastro
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaLight: { flex: 1, backgroundColor: colors.background },
  safeAreaDark: { flex: 1, backgroundColor: colors.backgroundDark },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  formError: {
    fontSize: 13,
    color: colors.danger,
  },
  submitButton: {
    marginTop: 8,
  },
  registerLink: {
    fontSize: 12,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 16,
  },
});
