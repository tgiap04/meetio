import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type EntityManager, type Repository } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import { Meeting } from '../database/entities/index.js';
import type { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { ScopedRepository } from '../common/repositories/scoped.repository.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import type { MeetingCursor } from './meeting-cursor.js';

export interface MeetingListFilter {
  q?: string;
  from?: Date;
  to?: Date;
  status?: MeetingStatus;
  cursor?: MeetingCursor;
  limit: number;
}

const notFound = () => new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');

/**
 * Meetings scoped to their owner. A meeting the retention job has soft-deleted
 * (`deleted_at` set) is treated exactly like one that never existed.
 */
@Injectable()
export class MeetingsRepository extends ScopedRepository<Meeting> {
  constructor(@InjectRepository(Meeting) repository: Repository<Meeting>) {
    super(repository, ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');
  }

  override async findOneOrFail(id: string, userId: string): Promise<Meeting> {
    const meeting = await this.repository
      .createQueryBuilder('m')
      .where('m.id = :id AND m.user_id = :userId AND m.deleted_at IS NULL', { id, userId })
      .getOne();
    if (!meeting) {
      throw notFound();
    }
    return meeting;
  }

  /**
   * Loads and row-locks an owned meeting inside `manager`'s transaction.
   * `FOR NO KEY UPDATE` rather than `FOR UPDATE`: it still serialises every
   * status change, but does not block the foreign-key checks of concurrent
   * segment inserts, which only need `FOR KEY SHARE`.
   */
  async lockOwned(manager: EntityManager, id: string, userId: string): Promise<Meeting> {
    const meeting = await manager
      .getRepository(Meeting)
      .createQueryBuilder('m')
      .setLock('for_no_key_update')
      .where('m.id = :id AND m.user_id = :userId AND m.deleted_at IS NULL', { id, userId })
      .getOne();
    if (!meeting) {
      throw notFound();
    }
    return meeting;
  }

  /** One page, newest first, plus whether another page exists and the cursor for the next one. */
  async listPage(userId: string, filter: MeetingListFilter): Promise<{ rows: Meeting[]; nextCursor: MeetingCursor | null }> {
    const qb = this.repository
      .createQueryBuilder('m')
      .addSelect(`to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, 'cursor_created_at')
      .where('m.user_id = :userId AND m.deleted_at IS NULL', { userId })
      .orderBy('m.created_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .limit(filter.limit + 1);

    if (filter.q) {
      // Matches idx_meetings_title_trgm (unaccent(lower(title)) gin_trgm_ops):
      // "hop du an" finds "Họp dự án". LIKE wildcards in the input are escaped.
      const escaped = filter.q.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(`unaccent(lower(m.title)) LIKE '%' || unaccent(lower(:q)) || '%'`, { q: escaped });
    }
    if (filter.from) {
      qb.andWhere('m.created_at >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('m.created_at <= :to', { to: filter.to });
    }
    if (filter.status) {
      qb.andWhere('m.status = :status', { status: filter.status });
    }
    if (filter.cursor) {
      const { createdAt, id } = filter.cursor;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('m.created_at < :cAt::timestamptz', { cAt: createdAt })
            .orWhere('m.created_at = :cAt::timestamptz AND m.id < :cId', { cAt: createdAt, cId: id }),
        ),
      );
    }

    const { entities, raw } = await qb.getRawAndEntities<{ cursor_created_at: string }>();
    if (entities.length <= filter.limit) {
      return { rows: entities, nextCursor: null };
    }
    const rows = entities.slice(0, filter.limit);
    const last = rows[rows.length - 1];
    // getRawAndEntities keeps raw rows in the same order as entities.
    return { rows, nextCursor: { createdAt: raw[filter.limit - 1].cursor_created_at, id: last.id } };
  }
}
