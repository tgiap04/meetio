import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type {
  MeetingStatusResponse,
  MeetingStepStatus,
  ProcessingJobStatus,
  ProcessingStep,
  ReindexMeetingRequest,
} from '@meetio/shared';
import { MeetingStatus } from '../../database/enums/meeting-status.enum.js';

const STEPS = ['chunk', 'embed', 'extract', 'resolve', 'summarize'];

export class ReindexMeetingDto implements ReindexMeetingRequest {
  @ApiProperty({ enum: ['changed', 'full'], description: 'changed = edited parts, or resume after a failure; full = everything' })
  @IsIn(['changed', 'full'])
  scope!: 'changed' | 'full';
}

export class MeetingStepStatusDto implements MeetingStepStatus {
  @ApiProperty({ enum: STEPS }) step!: ProcessingStep;
  @ApiProperty({ enum: ['pending', 'running', 'succeeded', 'failed'] }) status!: ProcessingJobStatus;
  @ApiProperty() attempts!: number;
  @ApiProperty({ nullable: true, type: String }) error_message!: string | null;
  @ApiProperty({ nullable: true, type: String }) started_at!: string | null;
  @ApiProperty({ nullable: true, type: String }) finished_at!: string | null;
}

export class MeetingStatusResponseDto implements MeetingStatusResponse {
  @ApiProperty() meeting_id!: string;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty({ nullable: true, enum: STEPS }) current_step!: ProcessingStep | null;
  @ApiProperty({ type: [MeetingStepStatusDto] }) steps!: MeetingStepStatusDto[];
  @ApiProperty({ nullable: true, type: String }) failure_reason!: string | null;
  @ApiProperty() has_unprocessed_edits!: boolean;
}
