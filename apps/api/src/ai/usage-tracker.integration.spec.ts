import { randomUUID } from 'node:crypto';
import { AppDataSource, registerPgVectorTypes } from '../database/data-source.js';
import { UsageTracker } from './usage-tracker.js';
import { QuotaExceededError } from './ai-errors.js';

const maybeDescribe = process.env.DATABASE_URL ? describe : describe.skip;

maybeDescribe('UsageTracker (integration, real Postgres)', () => {
  const tracker = new UsageTracker(AppDataSource);
  const users: string[] = [];

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      await registerPgVectorTypes(AppDataSource);
    }
  });
  afterAll(async () => {
    await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await AppDataSource.destroy();
  });

  async function user(budget: number | null) {
    const id = randomUUID();
    users.push(id);
    await AppDataSource.query(
      `INSERT INTO users (id, email, display_name, password_hash, monthly_token_budget) VALUES ($1, $2, 'U', 'x', $3)`,
      [id, `u-${id}@meetio.test`, budget],
    );
    return id;
  }
  const use = (userId: string, input: number, output: number, at = 'now()') =>
    AppDataSource.query(
      `INSERT INTO usage_records (user_id, operation, model, input_tokens, output_tokens, created_at) VALUES ($1, 'test', 'm', $2, $3, ${at})`,
      [userId, input, output],
    );

  it('records every call with its token counts', async () => {
    const id = await user(null);
    await tracker.record({ userId: id, meetingId: null, operation: 'summarize', model: 'gemini-x', inputTokens: 10, outputTokens: 5 });
    const rows = await AppDataSource.query('SELECT operation, model, input_tokens, output_tokens FROM usage_records WHERE user_id = $1', [id]);
    expect(rows).toEqual([{ operation: 'summarize', model: 'gemini-x', input_tokens: 10, output_tokens: 5 }]);
  });

  it('has no cap while no budget is configured (OQ-04 still open)', async () => {
    const id = await user(null);
    await use(id, 1_000_000, 1_000_000);
    await expect(tracker.assertWithinBudget(id)).resolves.toBeUndefined();
  });

  it('refuses once input + output tokens this month reach the budget', async () => {
    const id = await user(1000);
    await use(id, 600, 399);
    await expect(tracker.assertWithinBudget(id)).resolves.toBeUndefined();
    await use(id, 1, 0);
    await expect(tracker.assertWithinBudget(id)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('only counts the current calendar month', async () => {
    const id = await user(1000);
    await use(id, 5000, 0, "date_trunc('month', now()) - interval '1 day'");
    await expect(tracker.assertWithinBudget(id)).resolves.toBeUndefined();
  });
});
