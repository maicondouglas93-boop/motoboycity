export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Wallet: undefined;
  WalletWithdraw: undefined;
  WalletAdvance: undefined;
  History: undefined;
  AvailableOrders: undefined;
  ScheduledOrders: undefined;
  MyShifts: undefined;
  OrderDetail: { orderId: string };
  Settings: undefined;
  Profile: undefined;
  Challenges: undefined;
  Support: undefined;
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
};
