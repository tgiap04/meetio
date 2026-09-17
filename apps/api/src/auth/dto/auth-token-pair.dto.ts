import { ApiProperty } from '@nestjs/swagger';
import type { AuthTokenPair, RefreshTokenResponse } from '@meetio/shared';
import { PublicUserDto } from '../../users/dto/public-user.dto.js';

export class AuthTokenPairDto implements AuthTokenPair {
  @ApiProperty() access_token!: string;
  @ApiProperty() refresh_token!: string;
  @ApiProperty({ type: PublicUserDto }) user!: PublicUserDto;
}

export class RefreshTokenResponseDto implements RefreshTokenResponse {
  @ApiProperty() access_token!: string;
  @ApiProperty() refresh_token!: string;
}
