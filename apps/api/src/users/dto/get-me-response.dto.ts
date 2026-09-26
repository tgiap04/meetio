import { ApiProperty } from '@nestjs/swagger';
import type { GetMeResponse, RecordConsentResponse, TokenUsage } from '@meetio/shared';
import { PublicUserDto } from './public-user.dto.js';

export class GetMeResponseDto implements GetMeResponse {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty()
  current_month_tokens_used!: number;

  @ApiProperty({ description: 'This month against the budget; budget null = no cap' })
  usage!: TokenUsage;
}

export class RecordConsentResponseDto implements RecordConsentResponse {
  @ApiProperty()
  recording_consent_at!: string;

  @ApiProperty()
  consent_version!: number;
}
