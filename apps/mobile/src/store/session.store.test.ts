import { useSessionStore } from './session.store';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ accessToken: null, refreshToken: null, authStatus: 'hydrating' });
  });

  it('starts in the hydrating status', () => {
    expect(useSessionStore.getState().authStatus).toBe('hydrating');
  });

  it('setTokens marks the session authenticated', () => {
    useSessionStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });

    const state = useSessionStore.getState();
    expect(state).toMatchObject({ accessToken: 'a', refreshToken: 'r', authStatus: 'authenticated' });
  });

  it('clearTokens marks the session unauthenticated and drops tokens', () => {
    useSessionStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });
    useSessionStore.getState().clearTokens();

    const state = useSessionStore.getState();
    expect(state).toMatchObject({ accessToken: null, refreshToken: null, authStatus: 'unauthenticated' });
  });

  it('finishHydration with a token pair authenticates the session', () => {
    useSessionStore.getState().finishHydration({ accessToken: 'a', refreshToken: 'r' });

    expect(useSessionStore.getState().authStatus).toBe('authenticated');
  });

  it('finishHydration with null marks the session unauthenticated', () => {
    useSessionStore.getState().finishHydration(null);

    expect(useSessionStore.getState().authStatus).toBe('unauthenticated');
  });
});
