import { randomUUID } from 'node:crypto';
import { AppDataSource } from '../../database/data-source.js';
import { chunkContentHash } from '../../chunking/chunker.js';
import { fakeGemini } from '../../chunking/__tests__/fake-gemini.js';
export { scriptedModel, type Rule } from '../../test-support/scripted-extraction-model.js';
import type { StepContext } from '../../pipeline/pipeline-step-handler.js';
import { ExtractStepHandler } from '../extract-step.handler.js';
import { ResolveStepHandler } from '../resolve-step.handler.js';
import { DEFAULT_RESOLVER_OPTIONS, EntityResolver, type ResolverOptions } from '../entity-resolver.js';

export class GraphKit {
  readonly users: string[] = [];
  readonly calls = { embed: 0, count: 0, generate: 0 };

  constructor(
    private readonly model: (prompt: string) => string,
    private readonly options: ResolverOptions = DEFAULT_RESOLVER_OPTIONS,
  ) {}

  async user(): Promise<string> {
    const id = randomUUID();
    this.users.push(id);
    await AppDataSource.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'G', 'x')`, [id, `g-${id}@meetio.test`]);
    return id;
  }

  /** A meeting whose chunks are already cut and embedded (what phase 12 leaves behind). */
  async meeting(userId: string, texts: string[], startedAt = new Date()): Promise<string> {
    const [{ id }] = await AppDataSource.query(
      `INSERT INTO meetings (user_id, title, status, source_language, started_at) VALUES ($1, 'Họp', 'processing', 'vi-VN', $2) RETURNING id`,
      [userId, startedAt],
    );
    for (const [i, text] of texts.entries()) {
      await AppDataSource.query(
        `INSERT INTO meeting_chunks (meeting_id, user_id, content, segment_start_seq, segment_end_seq, content_hash) VALUES ($1, $2, $3, $4, $4, $5)`,
        [id, userId, text, i + 1, chunkContentHash(i + 1, i + 1, text)],
      );
    }
    return id as string;
  }

  ctx(userId: string, meetingId: string): StepContext {
    return { userId, meetingId, run: 1, scope: 'full', changedSince: null, signal: new AbortController().signal };
  }

  async process(userId: string, meetingId: string): Promise<void> {
    const gemini = fakeGemini(AppDataSource, this.calls, this.model);
    await new ExtractStepHandler(AppDataSource, gemini.client).run(this.ctx(userId, meetingId));
    await new ResolveStepHandler(AppDataSource, gemini.client, new EntityResolver(this.options)).run(this.ctx(userId, meetingId));
  }

  entities(userId: string) {
    return AppDataSource.query(
      `SELECT e.id, e.canonical_name, e.type, e.aliases, e.is_user_edited, e.description, e.merged_into_id,
              (SELECT count(*)::int FROM entity_mentions m WHERE m.entity_id = e.id) AS mentions
       FROM entities e WHERE e.user_id = $1 ORDER BY e.canonical_name`,
      [userId],
    ) as Promise<{ id: string; canonical_name: string; type: string; aliases: string[]; is_user_edited: boolean; description: string | null; merged_into_id: string | null; mentions: number }[]>;
  }

  async cleanup(): Promise<void> {
    await AppDataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [this.users]);
  }
}
