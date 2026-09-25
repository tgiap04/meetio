import { ApiProperty } from '@nestjs/swagger';
import type {
  CreateMeetingResponse,
  ListMeetingsResponse,
  MeetingActionItem,
  MeetingDetailResponse,
  MeetingListItem,
  MeetingProcessingStep,
  MeetingStateResponse,
  ProcessingJobStatus,
  ProcessingStep,
} from '@meetio/shared';
import { MeetingStatus } from '../../database/enums/meeting-status.enum.js';
import { AudioSource } from '../../database/enums/audio-source.enum.js';
import { RecordingQuality } from '../../database/enums/recording-quality.enum.js';
import { ActionStatus } from '../../database/enums/action-status.enum.js';

export class CreateMeetingResponseDto implements CreateMeetingResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty() started_at!: string;
}

export class MeetingStateResponseDto implements MeetingStateResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty({ nullable: true, type: Number, description: 'Set once the meeting ends; excludes paused time' })
  duration_sec!: number | null;
}

export class MeetingListItemDto implements MeetingListItem {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty() source_language!: string;
  @ApiProperty({ nullable: true, type: String }) translate_to!: string | null;
  @ApiProperty({ nullable: true, type: String }) started_at!: string | null;
  @ApiProperty({ nullable: true, type: String }) ended_at!: string | null;
  @ApiProperty({ nullable: true, type: Number }) duration_sec!: number | null;
  @ApiProperty() created_at!: string;
}

export class ListMeetingsResponseDto implements ListMeetingsResponse {
  @ApiProperty({ type: [MeetingListItemDto] }) items!: MeetingListItemDto[];
  @ApiProperty({ nullable: true, type: String }) next_cursor!: string | null;
}

export class MeetingActionItemDto implements MeetingActionItem {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ nullable: true, type: String }) assignee_entity_id!: string | null;
  @ApiProperty({ nullable: true, type: String }) due_date!: string | null;
  @ApiProperty({ enum: ActionStatus }) status!: ActionStatus;
  @ApiProperty() is_manual!: boolean;
}

export class MeetingProcessingStepDto implements MeetingProcessingStep {
  @ApiProperty({ enum: ['chunk', 'embed', 'extract', 'resolve', 'summarize'] }) step!: ProcessingStep;
  @ApiProperty({ enum: ['pending', 'running', 'succeeded', 'failed'] }) status!: ProcessingJobStatus;
  @ApiProperty() attempts!: number;
  @ApiProperty({ nullable: true, type: String }) error_message!: string | null;
}

export class MeetingDetailResponseDto extends MeetingListItemDto implements MeetingDetailResponse {
  @ApiProperty({ enum: AudioSource }) audio_source!: AudioSource;
  @ApiProperty({ enum: RecordingQuality }) recording_quality!: RecordingQuality;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: [String] }) summary_citations!: unknown[] | null;
  @ApiProperty({ nullable: true, type: String }) failure_reason!: string | null;
  @ApiProperty() segment_count!: number;
  @ApiProperty({ type: [MeetingActionItemDto] }) action_items!: MeetingActionItemDto[];
  @ApiProperty({ type: [MeetingProcessingStepDto] }) processing_steps!: MeetingProcessingStepDto[];
  @ApiProperty() updated_at!: string;
}
