import { StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
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
  const isDark = useColorScheme() === 'dark';
  const text = isDark ? colors.textDark : colors.text;
  const muted = isDark ? colors.mutedDark : colors.muted;
  const border = isDark ? colors.borderDark : colors.border;

  // Sem onChangeText, o campo é só de exibição (telas ainda não wireadas) —
  // usar defaultValue evita o warning do React Native sobre input controlado
  // sem handler de mudança.
  const valueProps = onChangeText ? { value, onChangeText } : { defaultValue: value };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: muted }]}>{label}</Text>
      <TextInput
        {...valueProps}
        placeholder={placeholder}
        placeholderTextColor={muted}
        editable={editable}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
        style={[styles.input, { color: text, borderColor: error ? colors.danger : border }]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontSize: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: {
    fontSize: 11,
    color: colors.danger,
  },
});
