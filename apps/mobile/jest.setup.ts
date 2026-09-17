/**
 * Global Jest setup for apps/mobile.
 *
 * jest-expo's preset mocks most of the Expo SDK surface automatically, but
 * `expo-secure-store` ships a native module with no built-in Jest mock. Without
 * this, importing `src/storage/secure-store.ts` in a test throws
 * "NativeModule: SecureStore is null" long before the test body runs.
 *
 * The mock below is an in-memory keychain: enough to exercise real read/write/
 * delete behavior in tests without touching the actual OS keychain.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});
