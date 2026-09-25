import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

/** One device's Expo push token (US-30). A token moves to whoever registered it last. */
@Entity('push_tokens')
@Index('idx_push_tokens_user', ['user_id'])
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ type: 'text' })
  platform!: 'ios' | 'android';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  last_seen_at!: Date;
}
