/**
 * MOTOboyCity — Motoboy
 * Fase 9 — reprodução da estrutura visual das telas (sem API, sem recursos nativos)
 *
 * @format
 */

import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AvailableOrdersScreen } from './src/screens/AvailableOrdersScreen';
import { ChallengesScreen } from './src/screens/ChallengesScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
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
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Register">
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
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
