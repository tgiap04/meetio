import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Meeting } from './meeting.entity.js';
import { User } from './user.entity.js';
import { EntityRecord } from './entity-record.entity.js';
import { MeetingChunk } from './meeting-chunk.entity.js';
import { ActionStatus } from '../enums/action-status.enum.js';

/**
 * A single follow-up task extracted (or manually added) from a meeting.
 * See docs/data-model.md §5. `idx_actions_user_status` backs the
 * cross-meeting "my open tasks" screen (US-34).
 */
@Entity('action_items')
@Index('idx_actions_user_status', ['user_id', 'status', 'due_date'])
export class ActionItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_action_items_meeting')
  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text' })
  content!: string;

  @Index('idx_action_items_assignee')
  @Column({ name: 'assignee_entity_id', type: 'uuid', nullable: true })
  assignee_entity_id!: string | null;

  @ManyToOne(() => EntityRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_entity_id' })
  assignee_entity!: EntityRecord | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  due_date!: string | null;

  @Column({
    type: 'enum',
    enum: ActionStatus,
    enumName: 'action_status',
    default: ActionStatus.OPEN,
  })
  status!: ActionStatus;

  @Index('idx_action_items_source_chunk')
  @Column({ name: 'source_chunk_id', type: 'uuid', nullable: true })
  source_chunk_id!: string | null;

  @ManyToOne(() => MeetingChunk, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_chunk_id' })
  source_chunk!: MeetingChunk | null;

  @Column({ name: 'is_manual', type: 'boolean', default: false })
  is_manual!: boolean;

  /** Any user change sets it; pipeline re-runs keep such items (clarifications 2026-09-26). */
  @Column({ name: 'is_user_edited', type: 'boolean', default: false })
  is_user_edited!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;
}
