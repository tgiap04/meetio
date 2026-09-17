import 'reflect-metadata';
import argon2 from 'argon2';
import { AppDataSource, assertDatabaseUrl, registerPgVectorTypes } from './data-source.js';
import { User } from './entities/user.entity.js';
import { Meeting } from './entities/meeting.entity.js';
import { TranscriptSegment } from './entities/transcript-segment.entity.js';
import { MeetingChunk } from './entities/meeting-chunk.entity.js';
import { EntityRecord } from './entities/entity-record.entity.js';
import { EntityMention } from './entities/entity-mention.entity.js';
import { Relation } from './entities/relation.entity.js';
import { ActionItem } from './entities/action-item.entity.js';
import { SEED_USER, SEED_MEETINGS, SEED_ENTITIES, SEED_ACTION_ITEMS } from './seed-data.js';

const EMBEDDING_DIMENSIONS = 768;

/**
 * Deterministic pseudo-random unit-ish vector — there is no live Gemini
 * embedding call in a local seed script, but the vector is real (correct
 * dimensionality, varies per input) so HNSW indexing and cosine-distance
 * queries (see vector.repository.ts) exercise real data, not a stub.
 */
function seedEmbedding(seed: string): number[] {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const vector: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
    state = (state * 1103515245 + 12345) >>> 0;
    vector.push((state / 0xffffffff) * 2 - 1);
  }
  return vector;
}

async function seed(): Promise<void> {
  assertDatabaseUrl();

  await AppDataSource.initialize();
  await registerPgVectorTypes(AppDataSource);

  await AppDataSource.transaction(async (manager) => {
    const passwordHash = await argon2.hash(SEED_USER.password, { type: argon2.argon2id });
    const user = await manager.save(User, {
      email: SEED_USER.email,
      password_hash: passwordHash,
      display_name: SEED_USER.displayName,
      notification_settings: {},
    });

    const entityByName = new Map<string, EntityRecord>();
    for (const seedEntity of SEED_ENTITIES) {
      const entity = await manager.save(EntityRecord, {
        user_id: user.id,
        canonical_name: seedEntity.canonicalName,
        normalized_name: seedEntity.canonicalName.toLowerCase(),
        type: seedEntity.type,
        description: seedEntity.description,
        aliases: seedEntity.aliases,
        embedding: seedEmbedding(`entity:${seedEntity.canonicalName}`),
        is_user_edited: false,
      });
      entityByName.set(seedEntity.canonicalName, entity);
    }

    for (const [meetingIndex, seedMeeting] of SEED_MEETINGS.entries()) {
      const meeting = await manager.save(Meeting, {
        user_id: user.id,
        title: seedMeeting.title,
        status: seedMeeting.status,
        source_language: seedMeeting.sourceLanguage,
        summary: seedMeeting.summary,
        started_at: new Date(),
        last_activity_at: new Date(),
      });

      const segments: TranscriptSegment[] = [];
      for (const [seq, seedSegment] of seedMeeting.segments.entries()) {
        segments.push(
          await manager.save(TranscriptSegment, {
            meeting_id: meeting.id,
            seq,
            text: seedSegment.text,
            speaker_label: seedSegment.speaker,
            started_at_ms: seedSegment.startedAtMs,
            ended_at_ms: seedSegment.endedAtMs,
            is_edited: false,
          }),
        );
      }

      const chunkContent = segments.map((segment) => segment.text).join(' ');
      const chunk = await manager.save(MeetingChunk, {
        meeting_id: meeting.id,
        user_id: user.id,
        content: chunkContent,
        segment_start_seq: 0,
        segment_end_seq: segments.length - 1,
        token_count: Math.ceil(chunkContent.length / 4),
        embedding: seedEmbedding(`chunk:${meeting.id}`),
      });

      for (const seedEntity of SEED_ENTITIES) {
        if (chunkContent.includes(seedEntity.canonicalName)) {
          const entity = entityByName.get(seedEntity.canonicalName);
          if (entity) {
            await manager.save(EntityMention, {
              entity_id: entity.id,
              meeting_id: meeting.id,
              chunk_id: chunk.id,
              surface_form: seedEntity.canonicalName,
            });
          }
        }
      }

      for (const actionItem of SEED_ACTION_ITEMS) {
        if (actionItem.meetingIndex !== meetingIndex) continue;
        const assignee = entityByName.get(actionItem.assigneeEntityName) ?? null;
        await manager.save(ActionItem, {
          meeting_id: meeting.id,
          user_id: user.id,
          content: actionItem.content,
          assignee_entity_id: assignee?.id ?? null,
          due_date: actionItem.dueDate,
          source_chunk_id: chunk.id,
          is_manual: false,
        });
      }
    }

    const minh = entityByName.get('Minh');
    const meetio = entityByName.get('Meetio');
    if (minh && meetio) {
      await manager.save(Relation, {
        user_id: user.id,
        source_entity_id: minh.id,
        target_entity_id: meetio.id,
        relationship: 'phụ trách',
        meeting_id: (await manager.findOneOrFail(Meeting, { where: { user_id: user.id }, order: { created_at: 'ASC' } })).id,
        chunk_id: (await manager.findOneOrFail(MeetingChunk, { where: { user_id: user.id }, order: { created_at: 'ASC' } })).id,
        confidence: 0.92,
      });
    }
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded 1 user, ${SEED_MEETINGS.length} meetings, ${SEED_ENTITIES.length} entities.`);
  await AppDataSource.destroy();
}

seed().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed', error);
  process.exit(1);
});
