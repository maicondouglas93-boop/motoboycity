import AsyncStorage from '@react-native-async-storage/async-storage';
import { session } from '../src/lib/session';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => storage.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    storage.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    storage.delete(key);
  });
});

describe('sessao do motoboy', () => {
  it('preserva a escolha de permanecer online entre reinicios do JavaScript', async () => {
    await session.setDesiredAvailability(true);

    await expect(session.getDesiredAvailability()).resolves.toBe(true);
  });

  it('preserva a escolha explicita de ficar offline', async () => {
    await session.setDesiredAvailability(false);

    await expect(session.getDesiredAvailability()).resolves.toBe(false);
  });

  it('remove a intencao online junto com a sessao', async () => {
    await session.setToken('token', 'driver-1');
    await session.setDesiredAvailability(true);

    await session.clearToken();

    await expect(session.getDesiredAvailability()).resolves.toBeNull();
    await expect(session.getToken()).resolves.toBeNull();
  });
});
