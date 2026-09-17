import { ApiProperty } from '@nestjs/swagger';
import type { GetMeResponse, RecordConsentResponse } from '@meetio/shared';
import { PublicUserDto } from './public-user.dto.js';

export class GetMeResponseDto implements GetMeResponse {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty()
  current_month_tokens_used!: number;
}

export class RecordConsentResponseDto implements RecordConsentResponse {
  @ApiProperty()
  recording_consent_at!: string;
}
