import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { EndMeetingRequest } from '@meetio/shared';

export class EndMeetingDto implements EndMeetingRequest {
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
