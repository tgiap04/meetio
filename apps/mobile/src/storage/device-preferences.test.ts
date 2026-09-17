import {
  clearDevicePreferences,
  readDevicePreferences,
  writeMicPromptSeen,
  writeOnboardingCompleted,
} from './device-preferences';

const secureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock<Promise<string | null>, [string]>;
  setItemAsync: jest.Mock<Promise<void>, [string, string]>;
  deleteItemAsync: jest.Mock<Promise<void>, [string]>;
};

describe('device-preferences', () => {
  beforeEach(async () => {
    await secureStore.deleteItemAsync('meetio.onboarding_completed');
    await secureStore.deleteItemAsync('meetio.mic_prompt_seen');
    secureStore.getItemAsync.mockClear();
  });

  it('returns false for both flags when nothing has been written', async () => {
    await expect(readDevicePreferences()).resolves.toEqual({
      onboardingCompleted: false,
      micPromptSeen: false,
    });
  });

  it('reports true for each flag once it has been written', async () => {
    await writeOnboardingCompleted();
    await writeMicPromptSeen();

    await expect(readDevicePreferences()).resolves.toEqual({
      onboardingCompleted: true,
      micPromptSeen: true,
    });
  });

  it.each(['0', 'true', ''])('treats a non-"1" stored value (%p) as false', async (garbage) => {
    await secureStore.setItemAsync('meetio.onboarding_completed', garbage);

    await expect(readDevicePreferences()).resolves.toMatchObject({ onboardingCompleted: false });
  });

  it('fails open to {false,false} without throwing when the underlying read rejects', async () => {
    secureStore.getItemAsync.mockImplementationOnce(() => Promise.reject(new Error('keychain unavailable')));

    await expect(readDevicePreferences()).resolves.toEqual({
      onboardingCompleted: false,
      micPromptSeen: false,
    });
  });
});

describe('clearDevicePreferences', () => {
  it('sends a fully-onboarded device back to both false', async () => {
    await writeOnboardingCompleted();
    await writeMicPromptSeen();

    await clearDevicePreferences();

    await expect(readDevicePreferences()).resolves.toEqual({
      onboardingCompleted: false,
      micPromptSeen: false,
    });
  });

  it('is a no-op on a device that never completed onboarding', async () => {
    await expect(clearDevicePreferences()).resolves.toBeUndefined();
  });

  it('rejects rather than reporting a success it did not achieve', async () => {
    // A swallowed failure here is the worst outcome: the caller navigates to
    // onboarding, the flag stays in the Keychain, and the next launch skips it
    // again with nothing to explain why.
    secureStore.deleteItemAsync.mockImplementationOnce(() =>
      Promise.reject(new Error('keychain unavailable')),
    );

    await expect(clearDevicePreferences()).rejects.toThrow('keychain unavailable');
  });
});
