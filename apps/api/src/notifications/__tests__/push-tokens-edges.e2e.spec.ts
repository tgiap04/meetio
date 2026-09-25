import { jest } from '@jest/globals';
import { hasInfra, startE2eApp, type E2eApp } from '../../test-support/e2e-app.js';

const maybeDescribe = hasInfra ? describe : describe.skip;

maybeDescribe('push token edge cases (e2e)', () => {
  jest.setTimeout(60_000);
  let e2e: E2eApp;
  let owner: { id: string; token: string };

  beforeAll(async () => {
    e2e = await startE2eApp();
    owner = await e2e.createUser();
  });
  afterAll(async () => e2e?.close());

  const TOKEN = 'ExponentPushToken[test12345678901234567890]';
  const TOKEN_NEVER_REGISTERED = 'ExponentPushToken[neverregistered1234567]';

  it('DELETE of a token never registered returns 204 (idempotent)', async () => {
    const res = await e2e.http('DELETE', '/users/me/push-tokens', owner.token, { token: TOKEN_NEVER_REGISTERED });
    expect(res.status).toBe(204);
  });

  it('DELETE of a registered token removes it and returns 204', async () => {
    // Register first (returns 204)
    const register = await e2e.http('POST', '/users/me/push-tokens', owner.token, {
      token: TOKEN,
      platform: 'ios',
    });
    expect(register.status).toBe(204);

    // Delete it (returns 204)
    const del = await e2e.http('DELETE', '/users/me/push-tokens', owner.token, { token: TOKEN });
    expect(del.status).toBe(204);
  });

  it('DELETE a second time returns 204 (idempotent)', async () => {
    // Register a token first
    await e2e.http('POST', '/users/me/push-tokens', owner.token, {
      token: TOKEN,
      platform: 'ios',
    });

    const res1 = await e2e.http('DELETE', '/users/me/push-tokens', owner.token, { token: TOKEN });
    expect(res1.status).toBe(204);

    const res2 = await e2e.http('DELETE', '/users/me/push-tokens', owner.token, { token: TOKEN });
    expect(res2.status).toBe(204);
  });
});
