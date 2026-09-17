import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { RefreshTokenRequest } from '@meetio/shared';

export class RefreshTokenDto implements RefreshTokenRequest {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refresh_token!: string;
}
