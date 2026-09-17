/**
 * Jest config in ESM mode (apps/api has "type": "module" for Nest 12 / NodeNext).
 * Kept as a .cjs file so Jest's config loader reads it unambiguously as CommonJS
 * regardless of the package.json "type" field. See docs/journals for the ESM
 * migration notes.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/../jest.setup.cjs'],
  moduleNameMapper: {
    '^@meetio/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../tsconfig.jest.json',
      },
    ],
  },
};
