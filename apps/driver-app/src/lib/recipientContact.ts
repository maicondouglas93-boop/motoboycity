import { Alert, Linking } from 'react-native';

/**
 * O telefone no formato que o WhatsApp exige: DDI + DDD + numero, so digitos.
 *
 * O telefone do pedido e texto livre que a loja digitou — `(28) 99999-0000`,
 * `028999990000`, `+55 28 ...`. O WhatsApp so abre a conversa com o numero
 * internacional completo; sem DDD nao ha como saber de onde e, e a funcao
 * devolve `null` para a tela oferecer a ligacao comum.
 */
export function whatsappNumber(phone: string): string | null {
  const international = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');

  if (international) return digits.length >= 10 && digits.length <= 15 ? digits : null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

/** Ligacao comum, pelo discador do aparelho. */
export async function callPhone(phone: string): Promise<void> {
  const normalized = phone.replace(/[^+\d]/g, '');
  if (!normalized) return;
  try {
    await Linking.openURL(`tel:${normalized}`);
  } catch {
    Alert.alert('Ligação indisponível', 'Não foi possível abrir o telefone neste aparelho.');
  }
}

function offerCall(phone: string, title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Ligar', onPress: () => callPhone(phone).catch(() => undefined) },
  ]);
}

/**
 * Abre a conversa do WhatsApp com o telefone do pedido.
 *
 * Usa o esquema `whatsapp://`, que vai direto ao aplicativo — o link `wa.me`
 * pode parar no navegador. O Android abre o esquema sem precisar declarar
 * `<queries>` no manifesto; sem WhatsApp instalado a abertura falha, e a
 * ligacao comum fica oferecida para o motoboy nao ficar sem contato.
 */
export async function openWhatsApp(phone: string): Promise<void> {
  const number = whatsappNumber(phone);
  if (!number) {
    offerCall(
      phone,
      'Número sem DDD',
      'O WhatsApp precisa do número com DDD. Você pode ligar para este telefone.',
    );
    return;
  }

  try {
    await Linking.openURL(`whatsapp://send?phone=${number}`);
  } catch {
    offerCall(
      phone,
      'WhatsApp não encontrado',
      'Não foi possível abrir o WhatsApp neste aparelho. Você pode ligar para este telefone.',
    );
  }
}
