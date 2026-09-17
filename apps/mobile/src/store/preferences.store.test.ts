jest.mock('../storage/device-preferences', () => ({
  writeOnboardingCompleted: jest.fn(),
  writeMicPromptSeen: jest.fn(),
}));

import { writeMicPromptSeen, writeOnboardingCompleted } from '../storage/device-preferences';
import { usePreferencesStore } from './preferences.store';

const mockedWriteOnboarding = writeOnboardingCompleted as jest.Mock;
const mockedWriteMicPrompt = writeMicPromptSeen as jest.Mock;

describe('usePreferencesStore', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ status: 'hydrating', onboardingCompleted: false, micPromptSeen: false });
    mockedWriteOnboarding.mockReset().mockResolvedValue(undefined);
    mockedWriteMicPrompt.mockReset().mockResolvedValue(undefined);
  });

  it('starts in the hydrating status', () => {
    expect(usePreferencesStore.getState().status).toBe('hydrating');
  });

  it('finishHydration moves to ready with the given values', () => {
    usePreferencesStore.getState().finishHydration({ onboardingCompleted: true, micPromptSeen: false });

    expect(usePreferencesStore.getState()).toMatchObject({
      status: 'ready',
      onboardingCompleted: true,
      micPromptSeen: false,
    });
  });

  it('markOnboardingCompleted sets state synchronously, without awaiting the write', () => {
    usePreferencesStore.getState().markOnboardingCompleted();

    // Asserted immediately, with no `await` in between — this is the
    // write-order contract from decisions.md §3.
    expect(usePreferencesStore.getState().onboardingCompleted).toBe(true);
    expect(mockedWriteOnboarding).toHaveBeenCalledTimes(1);
  });

  it('markMicPromptSeen sets state synchronously, without awaiting the write', () => {
    usePreferencesStore.getState().markMicPromptSeen();

    expect(usePreferencesStore.getState().micPromptSeen).toBe(true);
    expect(mockedWriteMicPrompt).toHaveBeenCalledTimes(1);
  });

  it('a rejected onboarding write does not throw and leaves state true', async () => {
    mockedWriteOnboarding.mockRejectedValue(new Error('keychain unavailable'));

    expect(() => usePreferencesStore.getState().markOnboardingCompleted()).not.toThrow();
    expect(usePreferencesStore.getState().onboardingCompleted).toBe(true);

    // Let the swallowed rejection's microtask flush; state must not change.
    await Promise.resolve();
    await Promise.resolve();
    expect(usePreferencesStore.getState().onboardingCompleted).toBe(true);
  });

  it('a rejected mic-prompt write does not throw and leaves state true', async () => {
    mockedWriteMicPrompt.mockRejectedValue(new Error('keychain unavailable'));

    expect(() => usePreferencesStore.getState().markMicPromptSeen()).not.toThrow();
    expect(usePreferencesStore.getState().micPromptSeen).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    expect(usePreferencesStore.getState().micPromptSeen).toBe(true);
  });

});
