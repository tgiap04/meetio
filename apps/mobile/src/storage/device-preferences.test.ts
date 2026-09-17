import { readDevicePreferences, writeMicPromptSeen, writeOnboardingCompleted } from './device-preferences';

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

