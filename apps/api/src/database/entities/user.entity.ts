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

  /** NULL for an account that has only ever signed in with Google
   * (decisions.md §2 — no `provider` column; `chk_users_has_credential`
   * requires at least one of this or `google_sub` to be set). */
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  password_hash!: string | null;

  /** Google's `sub` claim — stable per-account, unlike email (decisions.md §1).
   * NULL for a password-only account that has never linked Google. */
  @Index('idx_users_google_sub', { unique: true })
  @Column({ name: 'google_sub', type: 'text', nullable: true })
  google_sub!: string | null;

  @Column({ name: 'display_name', type: 'text' })
  display_name!: string;

  @Column({ name: 'retention_days', type: 'int', nullable: true })
  retention_days!: number | null;

  @Column({ name: 'recording_consent_at', type: 'timestamptz', nullable: true })
  recording_consent_at!: Date | null;

  /** Consent text version accepted; below CURRENT_CONSENT_VERSION = ask again (NFR-01). */
  @Column({ name: 'consent_version', type: 'int', nullable: true })
  consent_version!: number | null;

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
