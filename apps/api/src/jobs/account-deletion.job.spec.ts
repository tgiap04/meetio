import { jest } from '@jest/globals';
import { AccountMaintenanceService } from './account-deletion.job.js';
import type { User, Meeting } from '../database/entities/index.js';

function createUsersRepoMock() {
  return {
    find: jest.fn(async (): Promise<User[]> => []),
    delete: jest.fn(async () => ({ affected: 0, raw: [] as unknown[] })),
  };
}

function createMeetingsRepoMock() {
  return {
    find: jest.fn(async (): Promise<Meeting[]> => []),
    update: jest.fn(async () => ({ affected: 0, raw: [] as unknown[], generatedMaps: [] })),
  };
}

describe('AccountMaintenanceService', () => {
  let users: ReturnType<typeof createUsersRepoMock>;
  let meetings: ReturnType<typeof createMeetingsRepoMock>;
  let service: AccountMaintenanceService;

  beforeEach(() => {
    users = createUsersRepoMock();
    meetings = createMeetingsRepoMock();
    service = new AccountMaintenanceService(users as never, meetings as never);
  });

  describe('hardDeleteExpiredAccounts', () => {
    it('deletes every account soft-deleted more than 30 days ago', async () => {
      users.find.mockResolvedValue([{ id: 'u1' } as User, { id: 'u2' } as User]);

      const count = await service.hardDeleteExpiredAccounts();

      expect(users.delete).toHaveBeenCalledWith(['u1', 'u2']);
      expect(count).toBe(2);
    });

    it('does nothing when no account has passed the grace period', async () => {
      users.find.mockResolvedValue([]);
      const count = await service.hardDeleteExpiredAccounts();
      expect(users.delete).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });
  });

  describe('applyRetentionPolicy', () => {
    it('deletes meetings past retention_days and warns about ones expiring within 7 days', async () => {
      users.find.mockResolvedValue([{ id: 'user-1', retention_days: 30 } as User]);
      meetings.find
        .mockResolvedValueOnce([{ id: 'm-expired' } as Meeting]) // expired
        .mockResolvedValueOnce([{ id: 'm-soon' } as Meeting]); // about to expire

      const result = await service.applyRetentionPolicy();

      expect(meetings.update).toHaveBeenCalledWith(['m-expired'], { deleted_at: expect.any(Date) });
      expect(result).toEqual({ deleted: 1, warned: 1 });
    });

    it('skips users with retention_days = null (keep forever) by query filter', async () => {
      users.find.mockResolvedValue([]);
      await service.applyRetentionPolicy();
      expect(meetings.find).not.toHaveBeenCalled();
    });
  });
});
