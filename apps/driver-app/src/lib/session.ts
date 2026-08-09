import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'motoboycity.driver.accessToken';

/**
 * Sessão persistida via AsyncStorage (equivalente ao localStorage dos apps
 * web) — sem refresh token, mesma decisão já tomada para company-web e
 * admin-web. API assíncrona porque AsyncStorage é assíncrono.
 */
export const session = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  },
  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  async clearToken(): Promise<void> {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  },
};
