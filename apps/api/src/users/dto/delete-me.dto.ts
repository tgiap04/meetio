import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import type { DeleteMeRequest } from '@meetio/shared';

/**
 * Both fields are optional here — "exactly one, and which one" is an
 * account-state question (does this user have a `password_hash`?) that the
 * DTO layer cannot answer. `UsersService.deleteMe` enforces that rule.
 */
export class DeleteMeDto implements DeleteMeRequest {
  @ApiProperty({ description: 'Current password; required for a password account', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @ApiProperty({ description: 'Google ID token; required for a Google-only account', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  google_id_token?: string;
}
