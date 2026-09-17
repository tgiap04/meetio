/**
 * Root ESLint config for the whole yarn workspace.
 *
 * NOTE: `camelcase` is intentionally left OFF. `docs/api-spec.md` is a client
 * contract written in snake_case (`access_token`, `started_at_ms`, `meeting_id`).
 * Do not enable a naming-convention rule that would fight the wire format.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    camelcase: 'off',
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.expo',
    'coverage',
    '**/*.js',
    'apps/api/openapi.json',
  ],
};
