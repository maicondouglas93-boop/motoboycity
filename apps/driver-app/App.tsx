/**
 * MOTOboyCity — Motoboy
 * Entrada do aplicativo operacional: autenticação, presença, ofertas,
 * entregas, carteira e históricos usam os contratos reais da API.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
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
import { authApi } from './src/lib/apiClient';
import { session } from './src/lib/session';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Home' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveInitialRoute() {
      const token = await session.getToken();
      if (!token) {
        if (!cancelled) setInitialRoute('Login');
        return;
      }
      try {
        await authApi.me(token);
        if (!cancelled) setInitialRoute('Home');
      } catch {
        await session.clearToken();
        if (!cancelled) setInitialRoute('Login');
      }
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
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
