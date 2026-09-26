import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiErrorCode, type ActionAssignee, type ActionFiltersResponse, type ActionListResponse, type MeetingActionItem, type MeetingSummaryResponse, type SummaryCitation } from '@meetio/shared';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { hasUnprocessedEdits } from '../meetings/meeting-edits.js';
import { actionContentKey, loadActionItems, withoutMeeting } from './action-item-rows.js';
import type { ActionListQueryDto, CreateActionItemDto, UpdateActionItemDto } from './dto/actions.dto.js';

const meetingNotFound = () => new OwnershipViolationException(ApiErrorCode.MEETING_NOT_FOUND, 'Không tìm thấy cuộc họp');
const itemNotFound = () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy việc cần làm');
const assigneeNotFound = () => new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy người phụ trách');

/** api-spec §5: summaries and action items. Every query is scoped to the caller. */
@Injectable()
export class ActionsService {
  constructor(private readonly dataSource: DataSource) {}

  async summary(userId: string, meetingId: string): Promise<MeetingSummaryResponse> {
    const [m] = (await this.dataSource.query(
      'SELECT summary, summary_citations, summary_insufficient FROM meetings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [meetingId, userId],
    )) as { summary: string | null; summary_citations: SummaryCitation[] | null; summary_insufficient: boolean }[];
    if (!m) throw meetingNotFound();
    const citations = m.summary_citations ?? [];
    return {
      meeting_id: meetingId,
      summary: m.summary,
      insufficient: m.summary_insufficient,
      points: citations.filter((c) => c.kind === 'point'),
      decisions: citations.filter((c) => c.kind === 'decision'),
      has_unprocessed_edits: await hasUnprocessedEdits(this.dataSource, meetingId),
    };
  }

  async forMeeting(userId: string, meetingId: string): Promise<{ items: MeetingActionItem[] }> {
    await this.ownedMeeting(this.dataSource.manager, userId, meetingId);
    return { items: (await loadActionItems(this.dataSource, 'a.meeting_id = $1 AND a.user_id = $2', [meetingId, userId])).map(withoutMeeting) };
  }

  /** US-34: everything across meetings; open first, done last. */
  async list(userId: string, q: ActionListQueryDto): Promise<ActionListResponse> {
    const limit = q.limit ?? 30;
    const offset = q.offset ?? 0;
    const rows = await loadActionItems(
      this.dataSource,
      `a.user_id = $1 AND ($2::action_status IS NULL OR a.status = $2) AND ($3::uuid IS NULL OR COALESCE(keep.id, ae.id) = $3)
       AND ($4::uuid IS NULL OR a.meeting_id = $4)`,
      [userId, q.status ?? null, q.assignee_entity_id ?? null, q.meeting_id ?? null, limit + 1, offset],
      `ORDER BY (a.status = 'done'), a.due_date NULLS LAST, a.created_at, a.id LIMIT $5 OFFSET $6`,
    );
    return { items: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
  }

  /** Filter chips and the exact open count, in one round trip. */
  async filters(userId: string): Promise<ActionFiltersResponse> {
    const open = `FROM action_items a JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL WHERE a.user_id = $1 AND a.status = 'open'`;
    const [[total], assignees, meetings] = await Promise.all([
      this.dataSource.query(`SELECT count(*)::int AS n ${open}`, [userId]) as Promise<{ n: number }[]>,
      this.dataSource.query(
        `SELECT COALESCE(keep.id, ae.id) AS id, COALESCE(keep.canonical_name, ae.canonical_name) AS canonical_name, count(*)::int AS open_count
         FROM action_items a JOIN meetings m ON m.id = a.meeting_id AND m.deleted_at IS NULL
         JOIN entities ae ON ae.id = a.assignee_entity_id LEFT JOIN entities keep ON keep.id = ae.merged_into_id
         WHERE a.user_id = $1 AND a.status = 'open' GROUP BY 1, 2 ORDER BY open_count DESC, canonical_name`,
        [userId],
      ) as Promise<ActionAssignee[]>,
      this.dataSource.query(
        `SELECT m.id, m.title, m.started_at, count(*)::int AS open_count ${open}
         GROUP BY m.id ORDER BY m.started_at DESC NULLS LAST, m.id LIMIT 100`,
        [userId],
      ) as Promise<{ id: string; title: string; started_at: Date | null; open_count: number }[]>,
    ]);
    return {
      open_total: total.n,
      assignees,
      meetings: meetings.map((x) => ({ ...x, started_at: x.started_at ? new Date(x.started_at).toISOString() : null })),
    };
  }

  async create(userId: string, meetingId: string, dto: CreateActionItemDto): Promise<MeetingActionItem> {
    return this.dataSource.transaction(async (m) => {
      await this.ownedMeeting(m, userId, meetingId);
      if (dto.assignee_entity_id) await this.ownedPerson(m, userId, dto.assignee_entity_id);
      const [{ id }] = (await m.query(
        `INSERT INTO action_items (meeting_id, user_id, content, assignee_entity_id, due_date, status, is_manual, is_user_edited)
         VALUES ($1, $2, $3, $4, $5, 'open', true, true) RETURNING id`,
        [meetingId, userId, dto.content.trim(), dto.assignee_entity_id ?? null, dto.due_date ?? null],
      )) as { id: string }[];
      return this.one(m, userId, id);
    });
  }

  /** Any change marks the item user-edited, so pipeline re-runs keep it. */
  async update(userId: string, id: string, dto: UpdateActionItemDto): Promise<MeetingActionItem> {
    const changes = ['content', 'assignee_entity_id', 'due_date', 'status'].some((k) => dto[k as keyof UpdateActionItemDto] !== undefined);
    return this.dataSource.transaction(async (m) => {
      const [owned] = await m.query('SELECT 1 FROM action_items a JOIN meetings mt ON mt.id = a.meeting_id AND mt.deleted_at IS NULL WHERE a.id = $1 AND a.user_id = $2 FOR UPDATE OF a', [id, userId]);
      if (!owned) throw itemNotFound();
      // An empty PATCH changes nothing — it must not quietly mark the item user-edited either.
      if (!changes) return this.one(m, userId, id);
      if (dto.assignee_entity_id) await this.ownedPerson(m, userId, dto.assignee_entity_id);
      await m.query(
        `UPDATE action_items SET
           content = COALESCE($3, content),
           assignee_entity_id = CASE WHEN $4::boolean THEN $5::uuid ELSE assignee_entity_id END,
           due_date = CASE WHEN $6::boolean THEN $7::date ELSE due_date END,
           status = COALESCE($8::action_status, status),
           is_user_edited = true, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [id, userId, dto.content?.trim() ?? null, dto.assignee_entity_id !== undefined, dto.assignee_entity_id ?? null, dto.due_date !== undefined, dto.due_date ?? null, dto.status ?? null],
      );
      return this.one(m, userId, id);
    });
  }

  /** Deleting an AI task remembers it, so a later re-run does not bring the same task back. */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const [rows] = (await m.query(
        'DELETE FROM action_items a USING meetings mt WHERE a.id = $1 AND a.user_id = $2 AND mt.id = a.meeting_id AND mt.deleted_at IS NULL RETURNING a.meeting_id, a.content, a.is_manual',
        [id, userId],
      )) as [{ meeting_id: string; content: string; is_manual: boolean }[], number];
      const [gone] = rows;
      if (!gone) throw itemNotFound();
      if (!gone.is_manual) {
        await m.query('INSERT INTO action_item_dismissals (meeting_id, content_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
          gone.meeting_id,
          actionContentKey(gone.content),
        ]);
      }
    });
  }

  private async one(m: EntityManager, userId: string, id: string): Promise<MeetingActionItem> {
    const [item] = await loadActionItems(m, 'a.id = $1 AND a.user_id = $2', [id, userId]);
    return withoutMeeting(item);
  }

  private async ownedMeeting(m: EntityManager, userId: string, meetingId: string): Promise<void> {
    const [row] = await m.query('SELECT 1 FROM meetings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [meetingId, userId]);
    if (!row) throw meetingNotFound();
  }

  /** An assignee must be one of the caller's own live person entities. */
  private async ownedPerson(m: EntityManager, userId: string, entityId: string): Promise<void> {
    const [row] = await m.query(`SELECT 1 FROM entities WHERE id = $1 AND user_id = $2 AND type = 'person' AND merged_into_id IS NULL`, [entityId, userId]);
    if (!row) throw assigneeNotFound();
  }
}
