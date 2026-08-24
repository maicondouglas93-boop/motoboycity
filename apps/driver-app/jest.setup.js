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

/**
 * Modulo nativo dos botoes da notificacao.
 *
 * Acrescentado ao objeto em vez de mockado com `jest.mock`: mockar o modulo
 * inteiro exigiria `requireActual`, que aciona a ponte nativa e derruba a suite
 * com "__fbBatchedBridgeConfig is not set".
 */
const { NativeModules } = require('react-native');
NativeModules.OfferSession = {
  save: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  dismiss: jest.fn(() => Promise.resolve()),
  presentationStatus: jest.fn(() =>
    Promise.resolve({
      notificationsEnabled: true,
      fullScreenGranted: true,
      fullScreenNeedsManualGrant: true,
    }),
  ),
  openFullScreenSettings: jest.fn(() => Promise.resolve()),
};

/**
 * Mapa.
 *
 * `react-native-maps` chama `TurboModuleRegistry.getEnforcing` no import, que
 * so existe com a ponte nativa viva. No jest isso derruba qualquer suite que
 * importe uma tela — todas importam, porque o mapa e o fundo do aplicativo.
 *
 * O mock devolve uma View comum, entao o que os testes verificam continua sendo
 * o conteudo por cima do mapa, que e o que importa aqui.
 */
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref, testID: props.testID ?? 'map-view' }),
  );
  MapView.displayName = 'MapView';
  return {
    __esModule: true,
    default: MapView,
    PROVIDER_GOOGLE: 'google',
    Marker: (props) => React.createElement(View, props),
    Polyline: (props) => React.createElement(View, props),
  };
});
