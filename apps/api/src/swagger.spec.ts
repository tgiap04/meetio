import { isSwaggerEnabled } from './swagger.js';

/** Build a bare env so a real NODE_ENV/SWAGGER_ENABLED on the machine cannot leak in. */
function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('isSwaggerEnabled', () => {
  describe('explicit opt-in', () => {
    it.each(['true', 'TRUE', '  True  ', '1', 'yes', 'on'])('serves docs for %p', (value) => {
      expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: value, NODE_ENV: 'production' }))).toBe(true);
    });

    it.each(['false', 'FALSE', '0', 'no', 'off'])('withholds docs for %p', (value) => {
      expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: value, NODE_ENV: 'development' }))).toBe(false);
    });

    it('lets an explicit false win over a non-production NODE_ENV', () => {
      expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: 'false', NODE_ENV: 'development' }))).toBe(
        false,
      );
    });
  });

  describe('default when SWAGGER_ENABLED is absent', () => {
    it.each([undefined, '', '   '])('serves docs outside production (value %p)', (value) => {
      expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: value, NODE_ENV: 'development' }))).toBe(true);
    });

    it.each([undefined, '', '   '])('withholds docs in production (value %p)', (value) => {
      expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: value, NODE_ENV: 'production' }))).toBe(false);
    });

    it('withholds docs in production even with NODE_ENV unset nowhere else set', () => {
      expect(isSwaggerEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
    });
  });

  // The two properties that make this a security control rather than a preference.
  describe('fails safe', () => {
    it('does not expose docs in production when the operator forgets the variable', () => {
      // The realistic deployment mistake: ship to prod, never set SWAGGER_ENABLED.
      // Swagger publishes every route and auth scheme, so the default must be off.
      expect(isSwaggerEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
    });

    it.each(['ture', 'enabled', 'y', 'maybe', 'TRUE!', '2'])(
      'treats the unrecognised value %p as disabled, not enabled',
      (value) => {
        // A typo must not become an information disclosure.
        expect(isSwaggerEnabled(env({ SWAGGER_ENABLED: value, NODE_ENV: 'production' }))).toBe(
          false,
        );
      },
    );
  });
});
