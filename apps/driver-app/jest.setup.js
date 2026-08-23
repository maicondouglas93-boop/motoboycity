/* global jest */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

/**
 * O modulo nativo do Firebase nao existe no ambiente de teste.
 *
 * Sem este mock, importar `push.ts` derruba a suite inteira com "Native module
 * NativeRNFBTurboApp is not registered" — e o teste que quebra e o do App, que
 * nao tem nada a ver com push.
 */
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 },
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(() => Promise.resolve('token-de-teste')),
  onTokenRefresh: jest.fn(() => () => {}),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  setBackgroundMessageHandler: jest.fn(),
}));
