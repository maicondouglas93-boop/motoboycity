import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';

type FormFieldProps = {
  label: string;
  value?: string;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  autoCorrect?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onChangeText?: (text: string) => void;
  error?: string;
};

export function FormField({
  label,
  value,
  placeholder,
  editable = true,
  keyboardType,
  secureTextEntry,
  autoCorrect = true,
  autoCapitalize,
  onChangeText,
  error,
}: FormFieldProps) {
  // Sem onChangeText, o campo é só de exibição (telas ainda não wireadas) —
  // usar defaultValue evita o warning do React Native sobre input controlado
  // sem handler de mudança.
  const valueProps = onChangeText ? { value, onChangeText } : { defaultValue: value };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...valueProps}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
        style={[
          styles.input,
          !editable && styles.inputReadOnly,
          error && styles.inputError,
        ]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
  },
  inputReadOnly: { backgroundColor: colors.surfaceMuted, color: colors.inkMuted },
  inputError: { borderColor: colors.danger },
  error: {
    fontSize: 11,
    color: colors.danger,
  },
});
