import type {
  AskGlobalRequest,
  AskMeetingRequest,
  AskResponse,
  QaHistoryResponse,
} from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * GraphRAG Q&A endpoints (US-35→37, US-39) per
 * `packages/shared/src/qa/qa.types.ts` and docs/api-spec.md §6. Types come
 * straight from `@meetio/shared` — nothing here redeclares the wire shape.
 */

export interface QaHistoryQuery {
  before?: string;
  limit?: number;
}

/** `POST /meetings/:id/qa` — a question about one meeting (US-35/36). */
export async function askMeetingQuestion(meetingId: string, body: AskMeetingRequest): Promise<AskResponse> {
  const { data } = await apiClient.post<AskResponse>(`/meetings/${meetingId}/qa`, body);
  return data;
}

/** `GET /meetings/:id/qa?before=&limit=` — oldest first, `next_before` loads older. */
export async function getMeetingQaHistory(meetingId: string, query: QaHistoryQuery = {}): Promise<QaHistoryResponse> {
  const { data } = await apiClient.get<QaHistoryResponse>(`/meetings/${meetingId}/qa`, { params: query });
  return data;
}

export async function deleteMeetingQaHistory(meetingId: string): Promise<void> {
  await apiClient.delete(`/meetings/${meetingId}/qa`);
}

/** `POST /qa` — a question across the caller's meetings, with optional
 *  time-range and entity filters applying to this question only (US-37/39). */
export async function askGlobalQuestion(body: AskGlobalRequest): Promise<AskResponse> {
  const { data } = await apiClient.post<AskResponse>('/qa', body);
  return data;
}

export async function getGlobalQaHistory(query: QaHistoryQuery = {}): Promise<QaHistoryResponse> {
  const { data } = await apiClient.get<QaHistoryResponse>('/qa', { params: query });
  return data;
}

export async function deleteGlobalQaHistory(): Promise<void> {
  await apiClient.delete('/qa');
}
