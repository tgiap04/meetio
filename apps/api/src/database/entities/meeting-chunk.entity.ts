import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Meeting } from './meeting.entity.js';
import { User } from './user.entity.js';

/**
 * A retrieval chunk of merged transcript text with its embedding.
 * `user_id` is deliberately denormalized here — similarity search must filter
 * by owner inside the query itself, not via a join back to `meetings`, or the
 * HNSW index stops being useful (see docs/data-model.md §3).
 *
 * The HNSW index on `embedding` is created with raw SQL in the initial-schema
 * migration — TypeORM's `TableIndexTypes` has no `hnsw` option.
 */
@Entity('meeting_chunks')
export class MeetingChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_chunks_meeting')
  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Index('idx_chunks_user')
  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'segment_start_seq', type: 'int' })
  segment_start_seq!: number;

  @Column({ name: 'segment_end_seq', type: 'int' })
  segment_end_seq!: number;

  /** Real count from Gemini countTokens, written with the embedding; NULL until then. */
  @Column({ name: 'token_count', type: 'int', nullable: true })
  token_count!: number | null;

  /** gemini-embedding-001 at 768 dimensions, L2-normalised; NULL = chunked, not embedded yet. */
  @Column('vector', { length: 768, nullable: true })
  embedding!: number[] | null;

  /** sha256 of "start:end:content" — lets a re-run keep unchanged chunks (and what cites them). */
  @Index('uq_chunks_meeting_hash', ['meeting_id', 'content_hash'], { unique: true })
  @Column({ name: 'content_hash', type: 'text' })
  content_hash!: string;

  /** Validated extract-step output for this chunk; NULL with `extracted_at` set = skipped (invalid model output). */
  @Column({ type: 'jsonb', nullable: true })
  extraction!: unknown;

  @Column({ name: 'extracted_at', type: 'timestamptz', nullable: true })
  extracted_at!: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolved_at!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
