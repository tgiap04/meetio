import type { DataSource } from 'typeorm';
import { QuotaExceededError } from './ai-errors.js';

export interface UsageEntry {
  userId: string;
  meetingId: string | null;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Token accounting for every Gemini call (phase-11: "bắt buộc ghi usage_records
 * mỗi lượt gọi"; NFR-07). The budget check runs before a call; the record is
 * written after, with the token counts Gemini reported.
 */
export class UsageTracker {
  constructor(private readonly dataSource: DataSource) {}

  /** Throws QuotaExceededError when the user has a budget and has used it up this calendar month (UTC). */
  async assertWithinBudget(userId: string): Promise<void> {
    const [row] = (await this.dataSource.query(
      `SELECT u.monthly_token_budget::bigint AS budget,
              COALESCE((SELECT sum(r.input_tokens + r.output_tokens) FROM usage_records r
                        WHERE r.user_id = u.id AND r.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::bigint AS used
       FROM users u WHERE u.id = $1`,
      [userId],
    )) as { budget: string | null; used: string }[];
    // No budget configured = no cap yet: OQ-04 (the per-user limit) is still open.
    if (!row || row.budget === null) return;
    const budget = Number(row.budget);
    const used = Number(row.used);
    if (used >= budget) throw new QuotaExceededError(used, budget);
  }

  async record(entry: UsageEntry): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO usage_records (user_id, meeting_id, operation, model, input_tokens, output_tokens) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.userId, entry.meetingId, entry.operation, entry.model, entry.inputTokens, entry.outputTokens],
    );
  }
}
