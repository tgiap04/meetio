import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A Meetio account. `password_hash` must never be returned to a controller
 * (see docs/data-model.md §1 and phase-02 security notes).
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_users_email', { unique: true })
  @Column('citext')
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  password_hash!: string;

  @Column({ name: 'display_name', type: 'text' })
  display_name!: string;

  @Column({ name: 'retention_days', type: 'int', nullable: true })
  retention_days!: number | null;

  @Column({ name: 'recording_consent_at', type: 'timestamptz', nullable: true })
  recording_consent_at!: Date | null;

  @Column({ name: 'monthly_token_budget', type: 'bigint', nullable: true })
  monthly_token_budget!: string | null;

  @Column({ name: 'notification_settings', type: 'jsonb', default: () => "'{}'" })
  notification_settings!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}
