import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity.js';
import { EntityType } from '../enums/entity-type.enum.js';

/**
 * A canonical knowledge-graph entity, scoped to a USER (not a meeting) — see
 * docs/data-model.md §4 and phase-02's "Nhận định then chốt" on graph scope.
 *
 * Class is named `EntityRecord` (table `entities`) to avoid colliding with
 * TypeORM's own `@Entity` decorator.
 *
 * The HNSW index on `embedding` is created with raw SQL in the initial-schema
 * migration — TypeORM's `TableIndexTypes` has no `hnsw` option.
 */
@Entity('entities')
@Index('idx_entities_user_norm', ['user_id', 'normalized_name'])
export class EntityRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'canonical_name', type: 'text' })
  canonical_name!: string;

  @Column({ name: 'normalized_name', type: 'text' })
  normalized_name!: string;

  @Column({ type: 'enum', enum: EntityType, enumName: 'entity_type' })
  type!: EntityType;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('idx_entities_aliases', { type: 'gin' })
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  aliases!: string[];

  /** Embedding of name + description. */
  @Column('vector', { length: 768 })
  embedding!: number[];

  @Column({ name: 'is_user_edited', type: 'boolean', default: false })
  is_user_edited!: boolean;

  @Index('idx_entities_merged_into')
  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  merged_into_id!: string | null;

  @ManyToOne(() => EntityRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  merged_into!: EntityRecord | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;
}
