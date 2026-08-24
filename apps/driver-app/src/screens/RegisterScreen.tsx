import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { registerDriverSchema, pixKeyTypes, type PixKeyType } from '@motoboycity/validation';
import { ApiError } from '@motoboycity/api-client';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { authApi } from '../lib/apiClient';
import type { RootStackParamList } from '../navigation/types';
import { applyDateMask } from '../lib/dateMask';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const pixKeyTypeLabels: Record<PixKeyType, string> = {
  CPF: 'CPF',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Aleatória',
};

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  cpf: '',
  birthDate: '',
  pixKey: '',
  password: '',
  confirmPassword: '',
};

export function RegisterScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;

  const [form, setForm] = useState(initialFormState);
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('EMAIL');
  const [hasCnpj, setHasCnpj] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  function updateField(field: keyof typeof initialFormState, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit() {
    setFormError(null);

    const result = registerDriverSchema.safeParse({ ...form, pixKeyType, hasCnpj });
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
      await authApi.registerDriver({
        name: result.data.name,
        email: result.data.email,
        phone: result.data.phone,
        cpf: result.data.cpf,
        birthDate: result.data.birthDate,
        pixKey: result.data.pixKey,
        pixKeyType: result.data.pixKeyType,
        hasCnpj: result.data.hasCnpj,
        password: result.data.password,
      });
      setStatus('success');
    } catch (error) {
      setStatus('idle');
      setFormError(
        error instanceof ApiError ? error.message : 'Não foi possível concluir o cadastro.',
      );
    }
  }

  if (status === 'success') {
    return (
      <SafeAreaView style={isDark ? styles.safeAreaDark : styles.safeAreaLight}>
        <View style={styles.successContainer}>
          <Text style={[styles.successTitle, { color: text }]}>Cadastro enviado!</Text>
          <Text style={[styles.successBody, { color: isDark ? colors.mutedDark : colors.muted }]}>
            Sua conta foi criada e está aguardando aprovação da nossa equipe.
          </Text>
          <PrimaryButton
            label="Ir para o Login"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
            style={styles.submitButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={isDark ? styles.safeAreaDark : styles.safeAreaLight}>
      <ScreenHeader title="Cadastro de Motoboy" />
      <ScrollView contentContainerStyle={styles.content}>
        <FormField
          label="Nome completo"
          value={form.name}
          onChangeText={(value) => updateField('name', value)}
          error={fieldErrors.name}
        />
        <FormField
          label="E-mail"
          value={form.email}
          onChangeText={(value) => updateField('email', value)}
          keyboardType="email-address"
          autoCorrect={false}
          error={fieldErrors.email}
        />
        <FormField
          label="Telefone"
          value={form.phone}
          onChangeText={(value) => updateField('phone', value)}
          keyboardType="phone-pad"
          error={fieldErrors.phone}
        />
        <FormField
          label="CPF"
          value={form.cpf}
          onChangeText={(value) => updateField('cpf', value)}
          keyboardType="numeric"
          error={fieldErrors.cpf}
        />
        <FormField
          label="Data de Nascimento"
          value={form.birthDate}
          /**
           * A mascara poe as barras sozinha. O teclado aqui e numerico e nao tem
           * a tecla `/`, entao sem isto o formato exigido pela validacao seria
           * impossivel de digitar.
           */
          onChangeText={(value) => updateField('birthDate', applyDateMask(value))}
          placeholder="DD/MM/AAAA"
          keyboardType="numeric"
          error={fieldErrors.birthDate}
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: isDark ? colors.mutedDark : colors.muted }]}>
            Tipo da Chave PIX
          </Text>
          <View style={styles.chipRow}>
            {pixKeyTypes.map((type) => {
              const selected = type === pixKeyType;
              return (
                <Pressable
                  key={type}
                  onPress={() => setPixKeyType(type)}
                  style={[
                    styles.chip,
                    selected
                      ? styles.chipSelected
                      : isDark
                        ? styles.chipUnselectedDark
                        : styles.chipUnselectedLight,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      selected
                        ? styles.chipLabelSelected
                        : isDark
                          ? styles.chipLabelDark
                          : styles.chipLabelLight,
                    ]}
                  >
                    {pixKeyTypeLabels[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <FormField
          label="Chave PIX"
          value={form.pixKey}
          onChangeText={(value) => updateField('pixKey', value)}
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.pixKey}
        />

        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: isDark ? colors.mutedDark : colors.muted }]}>
            Possui CNPJ?
          </Text>
          <Switch value={hasCnpj} onValueChange={setHasCnpj} />
        </View>

        <FormField
          label="Senha"
          value={form.password}
          onChangeText={(value) => updateField('password', value)}
          secureTextEntry
          error={fieldErrors.password}
        />
        <FormField
          label="Confirmar Senha"
          value={form.confirmPassword}
          onChangeText={(value) => updateField('confirmPassword', value)}
          secureTextEntry
          error={fieldErrors.confirmPassword}
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <PrimaryButton
          label={status === 'submitting' ? 'Enviando...' : 'Criar Conta'}
          onPress={status === 'submitting' ? undefined : handleSubmit}
          style={styles.submitButton}
        />

        <Text
          style={[styles.homeLink, { color: isDark ? colors.primaryDark : colors.primary }]}
          onPress={() => navigation.navigate('Login')}
        >
          Já tem conta? Entrar
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaLight: { flex: 1, backgroundColor: colors.background },
  safeAreaDark: { flex: 1, backgroundColor: colors.backgroundDark },
  content: {
    padding: 16,
    gap: 12,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipUnselectedLight: { borderColor: colors.border, backgroundColor: 'transparent' },
  chipUnselectedDark: { borderColor: colors.borderDark, backgroundColor: 'transparent' },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipLabelSelected: { color: '#ffffff' },
  chipLabelLight: { color: colors.text },
  chipLabelDark: { color: colors.textDark },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  formError: {
    fontSize: 13,
    color: colors.danger,
  },
  submitButton: {
    marginTop: 8,
  },
  homeLink: {
    fontSize: 12,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 8,
    marginBottom: 24,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  successBody: {
    fontSize: 14,
    textAlign: 'center',
  },
});
