import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

/**
 * A refresh token issued to one device for one user.
 * `token_hash` must never be returned to a controller.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_refresh_tokens_user')
  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('idx_refresh_tokens_hash')
  @Column({ name: 'token_hash', type: 'text' })
  token_hash!: string;

  /**
   * Rotation-chain key for theft detection. All tokens descended from the
   * same register/login share this value; reusing a revoked token revokes
   * every row sharing it. See migration 1758000000009.
   */
  @Index('idx_refresh_tokens_family')
  @Column({ name: 'family_id', type: 'uuid' })
  family_id!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expires_at!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ name: 'device_label', type: 'text', nullable: true })
  device_label!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;
}
