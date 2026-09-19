import { jest } from '@jest/globals';
import type { User } from '../database/entities/index.js';
import type { GoogleIdentityClaims } from '../auth/google-identity.js';

/** Shared between users.service.spec.ts and users.service.delete-me.spec.ts —
 * kept here, not duplicated, so the two spec files stay in sync on shape. */
export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'a@example.com',
    password_hash: '',
    google_sub: null,
    display_name: 'A',
    retention_days: null,
    recording_consent_at: null,
    monthly_token_budget: null,
    notification_settings: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  } as User;
}

export function createUsersRepoMock() {
  return {
    findOne: jest.fn(async (): Promise<User | null> => null),
    save: jest.fn(async (entity: unknown) => entity as User),
  };
}

export function createGoogleVerifierMock() {
  return { verify: jest.fn(async (): Promise<GoogleIdentityClaims> => Promise.reject(new Error('not stubbed'))) };
}
