import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import { ScopedRepository, type UserOwnedEntity } from './scoped.repository.js';
import { OwnershipViolationException } from '../exceptions/ownership-violation.exception.js';

interface FakeNote extends UserOwnedEntity {
  id: string;
  user_id: string;
  body: string;
}

/** Minimal concrete subclass — exactly what a real module (e.g. meetings) would write. */
class NoteRepository extends ScopedRepository<FakeNote> {
  constructor(repository: Repository<FakeNote>) {
    super(repository, ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy ghi chú');
  }
}

function createMockRepository(): jest.Mocked<Repository<FakeNote>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn(async (entity: unknown) => entity),
    merge: jest.fn((entity: unknown, patch: unknown) => ({ ...(entity as object), ...(patch as object) })),
    delete: jest.fn(),
  } as unknown as jest.Mocked<Repository<FakeNote>>;
}

describe('ScopedRepository', () => {
  let repo: jest.Mocked<Repository<FakeNote>>;
  let notes: NoteRepository;

  beforeEach(() => {
    repo = createMockRepository();
    notes = new NoteRepository(repo);
  });

  it('findOneOrFail passes both id and user_id in the where clause', async () => {
    const note: FakeNote = { id: 'n1', user_id: 'u1', body: 'hi' };
    repo.findOne.mockResolvedValue(note);

    const result = await notes.findOneOrFail('n1', 'u1');

    expect(result).toBe(note);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'n1', user_id: 'u1' } });
  });

  it('throws a 404 OwnershipViolationException when the row belongs to someone else', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(notes.findOneOrFail('n1', 'attacker')).rejects.toThrow(OwnershipViolationException);
  });

  it('throws the same exception whether the row is owned by another user or does not exist', async () => {
    repo.findOne.mockResolvedValue(null);

    const missingRow = await notes.findOneOrFail('does-not-exist', 'u1').catch((e: unknown) => e);
    const wrongOwner = await notes.findOneOrFail('n1', 'attacker').catch((e: unknown) => e);

    expect(missingRow).toBeInstanceOf(OwnershipViolationException);
    expect(wrongOwner).toBeInstanceOf(OwnershipViolationException);
    expect((missingRow as OwnershipViolationException).getStatus()).toBe(404);
  });

  it('findAllForUser always merges user_id into the where clause', async () => {
    repo.find.mockResolvedValue([]);

    await notes.findAllForUser('u1', { where: { body: 'x' } as never });

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { body: 'x', user_id: 'u1' } }),
    );
  });

  it('createForUser forces user_id even if the caller tried to set a different one', async () => {
    await notes.createForUser('u1', { body: 'hi', user_id: 'someone-else' } as never);

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }));
  });

  it('updateOwned rejects the patch entirely (404) when the row is not owned by userId', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(notes.updateOwned('n1', 'attacker', { body: 'tampered' } as never)).rejects.toThrow(
      OwnershipViolationException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('deleteOwned verifies ownership before issuing the delete', async () => {
    const note: FakeNote = { id: 'n1', user_id: 'u1', body: 'hi' };
    repo.findOne.mockResolvedValue(note);

    await notes.deleteOwned('n1', 'u1');

    expect(repo.delete).toHaveBeenCalledWith({ id: 'n1', user_id: 'u1' });
  });

  it('deleteOwned never reaches the delete call for an unowned row', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(notes.deleteOwned('n1', 'attacker')).rejects.toThrow(OwnershipViolationException);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
