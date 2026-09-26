import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity.js';
import { MeetingStatus } from '../enums/meeting-status.enum.js';
import { AudioSource } from '../enums/audio-source.enum.js';
import { RecordingQuality } from '../enums/recording-quality.enum.js';

/**
 * One recorded/processed meeting session. See docs/data-model.md §2.
 *
 * The GIN trigram index on `unaccent(lower(title))` (idx_meetings_title_trgm)
 * is an expression index TypeORM's decorator API cannot express — it is
 * created with raw SQL in the initial-schema migration, not here.
 */
@Entity('meetings')
@Index('idx_meetings_user_created', ['user_id', 'created_at'], { where: 'deleted_at IS NULL' })
@Index('idx_meetings_status', ['status'], {
  where: "status IN ('recording','paused','queued','processing')",
})
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text' })
  title!: string;

  @Column({
    type: 'enum',
    enum: MeetingStatus,
    enumName: 'meeting_status',
    default: MeetingStatus.RECORDING,
  })
  status!: MeetingStatus;

  @Column({ name: 'source_language', type: 'text' })
  source_language!: string;

  @Column({ name: 'translate_to', type: 'text', nullable: true })
  translate_to!: string | null;

  @Column({ name: 'audio_source', type: 'enum', enum: AudioSource, enumName: 'audio_source', default: AudioSource.DEVICE_MIC })
  audio_source!: AudioSource;

  @Column({
    name: 'recording_quality',
    type: 'enum',
    enum: RecordingQuality,
    enumName: 'recording_quality',
    default: RecordingQuality.STANDARD,
  })
  recording_quality!: RecordingQuality;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /** Too short or empty to summarize; `summary` says so (US-31). */
  @Column({ name: 'summary_insufficient', type: 'boolean', default: false })
  summary_insufficient!: boolean;

  @Column({ name: 'summary_citations', type: 'jsonb', nullable: true })
  summary_citations!: unknown[] | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  started_at!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  ended_at!: Date | null;

  @Column({ name: 'duration_sec', type: 'int', nullable: true })
  duration_sec!: number | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failure_reason!: string | null;

  /** Set while `status = paused`; `resume` folds the elapsed time into `paused_duration_ms`. */
  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  paused_at!: Date | null;

  /** Total paused time so far — excluded from `duration_sec` (US-09). `bigint` comes back as a string. */
  @Column({
    name: 'paused_duration_ms',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) },
  })
  paused_duration_ms!: number;

  /** Increments on every (re)queue; job ids are `<id>-r<run>` so retries are new jobs and old ones are stale. */
  @Column({ name: 'pipeline_run', type: 'int', default: 0 })
  pipeline_run!: number;

  @Column({ name: 'pipeline_scope', type: 'text', default: 'full' })
  pipeline_scope!: 'full' | 'changed';

  /** When the current pipeline run started processing. Edits after it are not in the summary yet. */
  @Column({ name: 'pipeline_started_at', type: 'timestamptz', nullable: true })
  pipeline_started_at!: Date | null;

  /** Start of the previous run — a `changed` run re-processes segments edited after this. */
  @Column({ name: 'pipeline_changed_since', type: 'timestamptz', nullable: true })
  pipeline_changed_since!: Date | null;

  /** The "meeting ready" push is sent once per meeting (US-30). */
  @Column({ name: 'ready_notified_at', type: 'timestamptz', nullable: true })
  ready_notified_at!: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  last_activity_at!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}
