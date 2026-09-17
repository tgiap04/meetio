import { ApiProperty } from '@nestjs/swagger';
import type { PublicUser } from '@meetio/shared';
import type { User } from '../../database/entities/index.js';

/**
 * Wire-safe user shape. `User` the entity carries `password_hash` — this
 * class is the only thing allowed to leave the process, and the mapper
 * below is the only place a `User` becomes one (api-spec: entities never
 * reach a controller).
 */
export class PublicUserDto implements PublicUser {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() display_name!: string;
  @ApiProperty({ nullable: true, type: Number }) retention_days!: number | null;
  @ApiProperty({ nullable: true, type: String }) recording_consent_at!: string | null;
  @ApiProperty() monthly_token_budget!: number;
  @ApiProperty({ type: Object }) notification_settings!: Record<string, boolean>;
  @ApiProperty() created_at!: string;
  @ApiProperty() updated_at!: string;
}

export function toPublicUser(user: User): PublicUserDto {
  const dto = new PublicUserDto();
  dto.id = user.id;
  dto.email = user.email;
  dto.display_name = user.display_name;
  dto.retention_days = user.retention_days;
  dto.recording_consent_at = user.recording_consent_at ? user.recording_consent_at.toISOString() : null;
  dto.monthly_token_budget = user.monthly_token_budget ? Number(user.monthly_token_budget) : 0;
  dto.notification_settings = user.notification_settings as Record<string, boolean>;
  dto.created_at = user.created_at.toISOString();
  dto.updated_at = user.updated_at.toISOString();
  return dto;
}
