/**
 * Sem sistema de env vars no driver-app ainda (evitar depender de
 * react-native-config, um módulo nativo novo, só por causa disso).
 *
 * Em dispositivo físico via USB: rode `adb reverse tcp:3333 tcp:3333` para
 * que "localhost" no aparelho aponte para a API rodando na máquina dev.
 * Em emulador Android, troque para "http://10.0.2.2:3333".
 */
export const API_BASE_URL = 'http://localhost:3333';
