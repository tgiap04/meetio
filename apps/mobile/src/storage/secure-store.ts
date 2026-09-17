import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper around `expo-secure-store`.
 *
 * Access and refresh tokens live here — Keychain on iOS, EncryptedSharedPreferences
 * on Android — never in AsyncStorage, which is plaintext on both platforms and
 * readable by anything with filesystem access to the app sandbox.
 */
const ACCESS_TOKEN_KEY = 'meetio.access_token';
const REFRESH_TOKEN_KEY = 'meetio.refresh_token';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function readTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export async function writeTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
