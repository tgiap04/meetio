import type { DeepPartial, FindOptionsOrder, FindOptionsWhere, Repository } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import { OwnershipViolationException } from '../exceptions/ownership-violation.exception.js';

/** Any entity a `ScopedRepository` can guard — it must carry its owner's id. */
export interface UserOwnedEntity {
  id: string;
  user_id: string;
}

export interface ScopedFindOptions<T> {
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  order?: FindOptionsOrder<T>;
  take?: number;
  skip?: number;
}

/**
 * Base repository for every table that belongs to a user. Every method here
 * requires `userId`, and the raw TypeORM `Repository<T>` stays `protected` —
 * a subclass can reach it, nothing outside this class hierarchy can.
 *
 * This is the IDOR fix for the whole project (phase-03, "Kiến trúc"): the
 * original spec has no ownership concept, so every resource endpoint was a
 * potential cross-user read/write. Enforcing `userId` in the method
 * signature — not as an optional filter a caller can forget — makes the
 * unscoped query impossible to write, not just discouraged by convention.
 *
 * A miss (wrong id, someone else's row, or a genuinely missing id) always
 * throws `OwnershipViolationException` → HTTP 404. Never 403: api-spec §0
 * treats "not yours" and "doesn't exist" as the same fact for an attacker.
 */
export abstract class ScopedRepository<T extends UserOwnedEntity> {
  protected constructor(
    protected readonly repository: Repository<T>,
    private readonly notFoundCode: ApiErrorCode = ApiErrorCode.MEETING_NOT_FOUND,
    private readonly notFoundMessage = 'Không tìm thấy tài nguyên',
  ) {}

  private ownedWhere(id: string, userId: string): FindOptionsWhere<T> {
    return { id, user_id: userId } as unknown as FindOptionsWhere<T>;
  }

  /** Fetches one row by id, scoped to `userId`. Throws 404 on any mismatch. */
  async findOneOrFail(id: string, userId: string): Promise<T> {
    const entity = await this.repository.findOne({ where: this.ownedWhere(id, userId) });
    if (!entity) {
      throw new OwnershipViolationException(this.notFoundCode, this.notFoundMessage);
    }
    return entity;
  }

  /** Lists rows for `userId` only — no unscoped variant exists. */
  async findAllForUser(userId: string, options: ScopedFindOptions<T> = {}): Promise<T[]> {
    return this.repository.find({
      where: this.mergeUserWhere(userId, options.where),
      order: options.order,
      take: options.take,
      skip: options.skip,
    });
  }

  /** Counts rows for `userId` only. */
  async countForUser(userId: string, where?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<number> {
    return this.repository.count({ where: this.mergeUserWhere(userId, where) });
  }

  /** Inserts a new row, forcing `user_id` to the caller's id regardless of `data`. */
  async createForUser(userId: string, data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({ ...data, user_id: userId } as DeepPartial<T>);
    return this.repository.save(entity);
  }

  /** Verifies ownership, applies `patch`, and persists — or throws 404. */
  async updateOwned(id: string, userId: string, patch: DeepPartial<T>): Promise<T> {
    const entity = await this.findOneOrFail(id, userId);
    const merged = this.repository.merge(entity, { ...patch, id, user_id: userId } as DeepPartial<T>);
    return this.repository.save(merged);
  }

  /** Verifies ownership, then deletes — or throws 404. */
  async deleteOwned(id: string, userId: string): Promise<void> {
    await this.findOneOrFail(id, userId);
    await this.repository.delete(this.ownedWhere(id, userId) as FindOptionsWhere<T>);
  }

  private mergeUserWhere(
    userId: string,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (!where) {
      return { user_id: userId } as unknown as FindOptionsWhere<T>;
    }
    if (Array.isArray(where)) {
      return where.map((clause) => ({ ...clause, user_id: userId }) as FindOptionsWhere<T>);
    }
    return { ...where, user_id: userId } as FindOptionsWhere<T>;
  }
}
