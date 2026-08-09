import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme/colors';
import { mockDriver } from '../lib/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const border = isDark ? colors.borderDark : colors.border;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}
    >
      <ScreenHeader title="Perfil" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: border }]}>
            <Text>{mockDriver.name.charAt(0)}</Text>
          </View>
          <Text style={styles.updatePhoto}>Atualizar Foto</Text>
        </View>

        <FormField label="Nome" value={mockDriver.name} />
        <FormField label="E-mail" value={mockDriver.email} editable={false} />
        <FormField label="Telefone" value={mockDriver.phone} />
        <FormField label="CPF" placeholder="Obrigatório" />
        <FormField label="Data de Nascimento" placeholder="Obrigatório" />

        <PrimaryButton label="Salvar" style={styles.saveButton} />

        <Text style={styles.link}>Atualizar senha</Text>
        <Text style={[styles.link, { color: colors.danger }]}>Excluir minha conta</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  avatarRow: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatePhoto: {
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  saveButton: {
    marginTop: 8,
  },
  link: {
    fontSize: 13,
    textAlign: 'center',
    color: colors.primary,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
