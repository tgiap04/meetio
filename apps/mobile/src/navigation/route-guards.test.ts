import { shouldRedirectFromAppGroup, shouldRedirectFromAuthGroup } from './route-guards';

describe('shouldRedirectFromAppGroup', () => {
  it('blocks the (app) group while hydrating', () => {
    expect(shouldRedirectFromAppGroup('hydrating')).toBe(true);
  });

  it('blocks the (app) group while unauthenticated', () => {
    expect(shouldRedirectFromAppGroup('unauthenticated')).toBe(true);
  });

  it('allows the (app) group once authenticated', () => {
    expect(shouldRedirectFromAppGroup('authenticated')).toBe(false);
  });
});

describe('shouldRedirectFromAuthGroup', () => {
  it('allows login/register while unauthenticated', () => {
    expect(shouldRedirectFromAuthGroup('unauthenticated')).toBe(false);
  });

  it('allows login/register while hydrating', () => {
    expect(shouldRedirectFromAuthGroup('hydrating')).toBe(false);
  });

  it('redirects away from login/register once authenticated', () => {
    expect(shouldRedirectFromAuthGroup('authenticated')).toBe(true);
  });
});
