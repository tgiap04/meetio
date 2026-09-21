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

/**
 * `react-native-safe-area-context` reads real insets from a native module, so
 * without this every test that renders a screen has to be wrapped in a
 * provider or the hook throws "No safe area value available". The library's
 * own mock supplies static insets and a provider that just renders children.
 */
jest.mock('react-native-safe-area-context', () =>
  // `.default` — v5 puts the mocked module object on the default export, and
  // requiring the file itself hands back `{ default: ... }`, whose named
  // exports are all undefined. `require`, not `import`: a jest.mock factory is
  // hoisted above every import in the file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-safe-area-context/jest/mock').default,
);
