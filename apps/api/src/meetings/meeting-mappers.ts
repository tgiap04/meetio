import type { Meeting, ProcessingJob } from '../database/entities/index.js';
import type { MeetingListItemDto, MeetingProcessingStepDto } from './dto/meeting-responses.dto.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The only place a `Meeting` entity becomes wire JSON — entities never reach a controller. */
export function toMeetingListItem(m: Meeting): MeetingListItemDto {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    source_language: m.source_language,
    translate_to: m.translate_to,
    started_at: iso(m.started_at),
    ended_at: iso(m.ended_at),
    duration_sec: m.duration_sec,
    created_at: m.created_at.toISOString(),
  };
}

export function toMeetingProcessingStep(j: ProcessingJob): MeetingProcessingStepDto {
  return { step: j.step, status: j.status, attempts: j.attempts, error_message: j.error_message };
}
