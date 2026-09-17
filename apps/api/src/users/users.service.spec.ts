import { jest } from '@jest/globals';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from './users.service.js';
import type { User, UsageRecord } from '../database/entities/index.js';

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'a@example.com',
    password_hash: '',
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

function createUsersRepoMock() {
  return {
    findOne: jest.fn(async (): Promise<User | null> => null),
    save: jest.fn(async (entity: unknown) => entity as User),
  };
}

function createUsageRepoMock() {
  return { find: jest.fn(async (): Promise<Pick<UsageRecord, 'input_tokens' | 'output_tokens'>[]> => []) };
}

describe('UsersService', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let usage: ReturnType<typeof createUsageRepoMock>;
  let service: UsersService;

  beforeEach(() => {
    users = createUsersRepoMock();
    usage = createUsageRepoMock();
    service = new UsersService(users as never, usage as never);
  });

  describe('getMe', () => {
    it('returns notification_settings and sums the current month token usage', async () => {
      users.findOne.mockResolvedValue(fakeUser({ notification_settings: { email_digest: true } }));
      usage.find.mockResolvedValue([
        { input_tokens: 100, output_tokens: 50 },
        { input_tokens: 10, output_tokens: 5 },
      ]);

      const result = await service.getMe('user-1');

      expect(result.user.notification_settings).toEqual({ email_digest: true });
      expect(result.current_month_tokens_used).toBe(165);
      expect(result.user).not.toHaveProperty('password_hash');
    });

    it('throws 404 for a soft-deleted or missing user', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.getMe('gone')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('writes notification_settings so a later GET reads it back (api-spec §2)', async () => {
      users.findOne.mockResolvedValue(fakeUser());

      const result = await service.updateMe('user-1', { notification_settings: { sms: false } });

      expect(result.notification_settings).toEqual({ sms: false });
    });

    it('rejects a non-boolean value inside notification_settings as 400 VALIDATION_ERROR', async () => {
      users.findOne.mockResolvedValue(fakeUser());

      await expect(
        service.updateMe('user-1', { notification_settings: { sms: 'yes' as unknown as boolean } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates display_name and retention_days independently', async () => {
      users.findOne.mockResolvedValue(fakeUser());
      const result = await service.updateMe('user-1', { display_name: 'New Name', retention_days: 90 });
      expect(result.display_name).toBe('New Name');
      expect(result.retention_days).toBe(90);
    });
  });

  describe('recordConsent', () => {
    it('sets recording_consent_at to now and returns it', async () => {
      users.findOne.mockResolvedValue(fakeUser());
      const result = await service.recordConsent('user-1');
      expect(new Date(result.recording_consent_at).getTime()).toBeGreaterThan(0);
    });
  });

  describe('deleteMe', () => {
    it('sets deleted_at after verifying the password', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

      await service.deleteMe('user-1', 'correct-password');

      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(Date) }));
    });

    it('rejects deletion with the wrong password and does not touch deleted_at', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      users.findOne.mockResolvedValue(fakeUser({ password_hash: hash }));

      await expect(service.deleteMe('user-1', 'wrong-password')).rejects.toThrow(UnauthorizedException);
      expect(users.save).not.toHaveBeenCalled();
    });
  });
});
