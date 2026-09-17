import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';
import { EntityRecord } from './entity-record.entity.js';
import { Meeting } from './meeting.entity.js';
import { MeetingChunk } from './meeting-chunk.entity.js';

/**
 * One observed relationship between two entities. The same relationship
 * observed in multiple meetings intentionally produces multiple rows — the
 * repeat count is itself a confidence signal, and each row keeps its own
 * citation (docs/data-model.md §4).
 */
@Entity('relations')
export class Relation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_relations_user')
  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('idx_relations_source')
  @Column({ name: 'source_entity_id', type: 'uuid' })
  source_entity_id!: string;

  @ManyToOne(() => EntityRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_entity_id' })
  source_entity!: EntityRecord;

  @Index('idx_relations_target')
  @Column({ name: 'target_entity_id', type: 'uuid' })
  target_entity_id!: string;

  @ManyToOne(() => EntityRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_entity_id' })
  target_entity!: EntityRecord;

  @Column({ type: 'text' })
  relationship!: string;

  @Index('idx_relations_meeting')
  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Index('idx_relations_chunk')
  @Column({ name: 'chunk_id', type: 'uuid' })
  chunk_id!: string;

  @ManyToOne(() => MeetingChunk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chunk_id' })
  chunk!: MeetingChunk;

  @Column({ type: 'real' })
  confidence!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
