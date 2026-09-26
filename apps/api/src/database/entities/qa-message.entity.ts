import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';
import { Meeting } from './meeting.entity.js';
import type { QaRole } from '../enums/qa-role.enum.js';

/**
 * One turn of the Q&A assistant, scoped to a meeting or across meetings
 * (`meeting_id IS NULL`). See docs/data-model.md §5.
 *
 * `role` is a plain `varchar` with a CHECK constraint, not a PG enum type —
 * see enums/qa-role.enum.ts for why.
 */
@Entity('qa_messages')
@Index('idx_qa_user_meeting', ['user_id', 'meeting_id', 'created_at'])
export class QaMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meeting_id!: string | null;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting | null;

  @Column({ type: 'varchar', length: 16 })
  role!: QaRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  citations!: Array<{ chunk_id: string; meeting_id: string }> | null;

  @Column({ type: 'real', nullable: true })
  confidence!: number | null;

  /** Nothing answered it — said plainly, the model was not asked to guess. */
  @Column({ name: 'not_found', type: 'boolean', default: false })
  not_found!: boolean;

  /** Global questions: the date range / entity they were asked with. */
  @Column({ type: 'jsonb', nullable: true })
  filters!: Record<string, string | null> | null;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokens_used!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
