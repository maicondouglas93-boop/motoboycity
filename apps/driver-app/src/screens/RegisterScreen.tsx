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
  const border = isDark ? colors.borderDark : colors.border;
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
      <SafeAreaView
        style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
      >
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
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
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
          onChangeText={(value) => updateField('birthDate', value)}
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
                    {
                      borderColor: selected ? colors.primary : border,
                      backgroundColor: selected ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.chipLabel, { color: selected ? '#ffffff' : text }]}>
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
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
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
