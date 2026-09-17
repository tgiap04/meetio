import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';
import { Meeting } from './meeting.entity.js';

/**
 * One billable LLM/embedding call, for token-budget tracking (NFR-07,
 * docs/data-model.md §6).
 *
 * NOT part of the meeting-delete CASCADE set in docs/data-model.md §7 — a
 * usage/audit trail must outlive the meeting it was incurred for, so
 * `meeting_id` is `ON DELETE SET NULL` rather than CASCADE.
 */
@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_usage_records_user')
  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('idx_usage_records_meeting')
  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meeting_id!: string | null;

  @ManyToOne(() => Meeting, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting | null;

  @Column({ type: 'text' })
  operation!: string;

  @Column({ type: 'text' })
  model!: string;

  @Column({ name: 'input_tokens', type: 'int' })
  input_tokens!: number;

  @Column({ name: 'output_tokens', type: 'int' })
  output_tokens!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
