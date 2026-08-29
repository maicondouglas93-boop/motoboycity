/**
 * MOTOboyCity — Motoboy
 * Entrada do aplicativo operacional: autenticação, presença, ofertas,
 * entregas, carteira e históricos usam os contratos reais da API.
 *
 * @format
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DeliveryOperationScreen } from './src/screens/DeliveryOperationScreen';
import { DriverHistoryScreen } from './src/screens/DriverHistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AvailableDeliveriesScreen } from './src/screens/AvailableDeliveriesScreen';
import { IncomingOfferScreen } from './src/screens/IncomingOfferScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DriverOrderDetailScreen } from './src/screens/DriverOrderDetailScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { DriverWalletScreen } from './src/screens/DriverWalletScreen';
import { WithdrawalScreen } from './src/screens/WithdrawalScreen';
import { resolveInitialSessionRoute } from './src/lib/bootstrapSession';
import { subscribeSessionExpired } from './src/lib/sessionExpiry';
import type { RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.surface,
    card: colors.surface,
    text: colors.ink,
    border: colors.divider,
    primary: colors.actionSoft,
  },
};

function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Home' | null>(null);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null);

  /**
   * A sessao caiu no meio do expediente.
   *
   * `notifySessionExpired` ja limpou credencial, rastreamento e push; aqui so
   * resta tirar o motoboy de qualquer tela operacional e dizer o que aconteceu.
   * Sem isto ele continuava numa tela que nao respondia mais, concluindo que o
   * aplicativo tinha quebrado — o pior desfecho possivel, porque a solucao
   * (entrar de novo) estava a um toque de distancia e invisivel.
   */
  useEffect(
    () =>
      subscribeSessionExpired(() => {
        navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
        Alert.alert(
          'Sessao encerrada',
          'Sua sessao expirou ou foi encerrada pela administracao. Entre novamente para voltar a receber pedidos.',
        );
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveInitialRoute() {
      const route = await resolveInitialSessionRoute();
      if (!cancelled) setInitialRoute(route);
    }

    resolveInitialRoute().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="IncomingOffer"
            component={IncomingOfferScreen}
            options={{ presentation: 'modal', gestureEnabled: false }}
          />
          <Stack.Screen name="AvailableDeliveries" component={AvailableDeliveriesScreen} />
          <Stack.Screen name="Wallet" component={DriverWalletScreen} />
          <Stack.Screen name="Withdrawal" component={WithdrawalScreen} />
          <Stack.Screen name="History" component={DriverHistoryScreen} />
          <Stack.Screen name="OrderDetail" component={DriverOrderDetailScreen} />
          <Stack.Screen name="DeliveryOperation" component={DeliveryOperationScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
