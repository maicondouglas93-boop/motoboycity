import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDriverProfile } from './driverProfileCache';

const ACCESS_TOKEN_KEY = 'motoboycity.driver.accessToken';
const USER_ID_KEY = 'motoboycity.driver.userId';
const DESIRED_AVAILABILITY_KEY = 'motoboycity.driver.desiredAvailability';

/**
 * Sessão persistida via AsyncStorage (equivalente ao localStorage dos apps
 * web) — sem refresh token, mesma decisão já tomada para company-web e
 * admin-web. API assíncrona porque AsyncStorage é assíncrono.
 */
export const session = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  },
  async getUserId(): Promise<string | null> {
    return AsyncStorage.getItem(USER_ID_KEY);
  },
  async getDesiredAvailability(): Promise<boolean | null> {
    const value = await AsyncStorage.getItem(DESIRED_AVAILABILITY_KEY);
    if (value === 'AVAILABLE') return true;
    if (value === 'UNAVAILABLE') return false;
    return null;
  },
  async setToken(token: string, userId?: string): Promise<void> {
    clearDriverProfile();
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    if (userId) await AsyncStorage.setItem(USER_ID_KEY, userId);
  },
  async setUserId(userId: string): Promise<void> {
    await AsyncStorage.setItem(USER_ID_KEY, userId);
  },
  async setDesiredAvailability(available: boolean): Promise<void> {
    await AsyncStorage.setItem(DESIRED_AVAILABILITY_KEY, available ? 'AVAILABLE' : 'UNAVAILABLE');
  },
  async clearToken(): Promise<void> {
    clearDriverProfile();
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(USER_ID_KEY),
      AsyncStorage.removeItem(DESIRED_AVAILABILITY_KEY),
    ]);
  },
};
