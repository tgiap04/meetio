import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EntityRecord } from './entity-record.entity.js';
import { Meeting } from './meeting.entity.js';
import { MeetingChunk } from './meeting-chunk.entity.js';

/**
 * Bridge between a global entity and one concrete occurrence of it — enables
 * cross-meeting Q&A and per-entity timelines (docs/data-model.md §4, US-39).
 */
@Entity('entity_mentions')
@Index('idx_mentions_entity', ['entity_id', 'meeting_id'])
export class EntityMention {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entity_id!: string;

  @ManyToOne(() => EntityRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entity_id' })
  entity!: EntityRecord;

  @Index('idx_mentions_meeting')
  @Column({ name: 'meeting_id', type: 'uuid' })
  meeting_id!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Index('idx_mentions_chunk')
  @Column({ name: 'chunk_id', type: 'uuid' })
  chunk_id!: string;

  @ManyToOne(() => MeetingChunk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chunk_id' })
  chunk!: MeetingChunk;

  @Column({ name: 'surface_form', type: 'text' })
  surface_form!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
