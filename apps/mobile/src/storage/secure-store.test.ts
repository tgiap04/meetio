import { clearTokens, readTokens, writeTokens } from './secure-store';

describe('secure-store', () => {
  beforeEach(async () => {
    await clearTokens();
  });

  it('returns null when no tokens have been written', async () => {
    await expect(readTokens()).resolves.toBeNull();
  });

  it('round-trips a written token pair', async () => {
    await writeTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await expect(readTokens()).resolves.toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
  });

  it('clears both tokens', async () => {
    await writeTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await clearTokens();

    await expect(readTokens()).resolves.toBeNull();
  });

  it('treats a partial token pair (e.g. corrupted storage) as absent', async () => {
    await writeTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await clearTokens();
    // Simulate only one half surviving by writing just the access token.
    const secureStore = jest.requireMock('expo-secure-store');
    await secureStore.setItemAsync('meetio.access_token', 'orphaned-access');

    await expect(readTokens()).resolves.toBeNull();
  });
});
