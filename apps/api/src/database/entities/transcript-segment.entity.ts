import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Meeting } from './meeting.entity.js';

/**
 * Smallest unit of a meeting transcript — the single source of truth for
 * meeting content. `UNIQUE (meeting_id, seq)` makes client resend safe
 * (see docs/data-model.md §2, US-14).
 */
@Entity('transcript_segments')
@Index('uq_segment_meeting_seq', ['meeting_id', 'seq'], { unique: true })
@Index('idx_segment_meeting_time', ['meeting_id', 'started_at_ms'])
export class TranscriptSegment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Column({ type: 'int' })
  seq!: number;

  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'translated_text', type: 'text', nullable: true })
  translated_text!: string | null;

  @Column({ name: 'translated_to', type: 'text', nullable: true })
  translated_to!: string | null;

  @Column({ name: 'started_at_ms', type: 'int' })
  started_at_ms!: number;

  @Column({ name: 'ended_at_ms', type: 'int' })
  ended_at_ms!: number;

  @Column({ name: 'is_edited', type: 'boolean', default: false })
  is_edited!: boolean;

  @Column({ name: 'gap_before_ms', type: 'int', nullable: true })
  gap_before_ms!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
