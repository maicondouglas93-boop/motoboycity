export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Wallet: undefined;
  Withdrawal: undefined;
  History: undefined;
  OrderDetail: { orderId: string };
  DeliveryOperation: { deliveryId: string };
  IncomingOffer: undefined;
  AvailableDeliveries: undefined;
  Settings: undefined;
  Profile: undefined;
};

/**
 * Tipo mínimo para navegação dirigida por configuração (ex.: itens de menu
 * mapeados para nomes de tela). Evita o conflito de generics entre
 * NativeStackNavigationProp<RootStackParamList, "Home"> e
 * NativeStackNavigationProp<RootStackParamList, "Wallet"> etc. — só exige
 * o método navigate(), sem carregar os generics específicos de cada rota.
 */
export type ScreenNavigator = {
  navigate: (screen: keyof RootStackParamList) => void;
  reset: (state: { index: number; routes: Array<{ name: keyof RootStackParamList }> }) => void;
};
