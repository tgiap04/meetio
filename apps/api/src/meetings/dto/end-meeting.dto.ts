import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import type { EndMeetingRequest, MeetingTransitionRequest } from '@meetio/shared';

export class MeetingTransitionDto implements MeetingTransitionRequest {
  @ApiPropertyOptional({ description: 'When the user pressed the button (transition replayed after being offline). Clamped server-side' })
  @IsOptional()
  @IsISO8601({ strict: true })
  at?: string;
}

export class EndMeetingDto extends MeetingTransitionDto implements EndMeetingRequest {
  @ApiPropertyOptional({
    description: 'Highest seq the client assigned (seqs are contiguous from 1). Omit when the meeting has no segments.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  // ~2 segments/s for 24h is ~170k; anything far beyond is a client bug, not a meeting.
  @Max(1_000_000)
  last_seq?: number;
}
