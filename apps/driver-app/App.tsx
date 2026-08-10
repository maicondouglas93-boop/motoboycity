/**
 * MOTOboyCity — Motoboy
 * Fase 9 — reprodução da estrutura visual das telas (sem API, sem recursos nativos)
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AvailableOrdersScreen } from './src/screens/AvailableOrdersScreen';
import { ChallengesScreen } from './src/screens/ChallengesScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { IncomingOfferScreen } from './src/screens/IncomingOfferScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MyShiftsScreen } from './src/screens/MyShiftsScreen';
import { OrderDetailScreen } from './src/screens/OrderDetailScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ScheduledOrdersScreen } from './src/screens/ScheduledOrdersScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SupportScreen } from './src/screens/SupportScreen';
import { WalletAdvanceScreen } from './src/screens/WalletAdvanceScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { WalletWithdrawScreen } from './src/screens/WalletWithdrawScreen';
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

    void resolveInitialRoute();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="WalletWithdraw" component={WalletWithdrawScreen} />
          <Stack.Screen name="WalletAdvance" component={WalletAdvanceScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="AvailableOrders" component={AvailableOrdersScreen} />
          <Stack.Screen name="ScheduledOrders" component={ScheduledOrdersScreen} />
          <Stack.Screen name="MyShifts" component={MyShiftsScreen} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Challenges" component={ChallengesScreen} />
          <Stack.Screen name="Support" component={SupportScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
