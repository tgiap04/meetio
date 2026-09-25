import type { Meeting } from '../database/entities/index.js';
import type { MeetingStateResponseDto } from './dto/meeting-responses.dto.js';

export function toMeetingStateResponse(meeting: Meeting): MeetingStateResponseDto {
  return { id: meeting.id, status: meeting.status, duration_sec: meeting.duration_sec };
}
