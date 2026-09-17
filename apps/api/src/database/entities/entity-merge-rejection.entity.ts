import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity.js';
import { EntityRecord } from './entity-record.entity.js';

/**
 * Records an entity-merge suggestion the user explicitly rejected, so the
 * system stops re-suggesting the same pair (docs/data-model.md §4).
 * Composite PK `(user_id, entity_a_id, entity_b_id)`.
 */
@Entity('entity_merge_rejections')
export class EntityMergeRejection {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @PrimaryColumn({ name: 'entity_a_id', type: 'uuid' })
  entity_a_id!: string;

  @ManyToOne(() => EntityRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entity_a_id' })
  entity_a!: EntityRecord;

  @Index('idx_merge_rejections_entity_b')
  @PrimaryColumn({ name: 'entity_b_id', type: 'uuid' })
  entity_b_id!: string;

  @ManyToOne(() => EntityRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entity_b_id' })
  entity_b!: EntityRecord;

  @CreateDateColumn({ name: 'rejected_at', type: 'timestamptz' })
  rejected_at!: Date;
}
