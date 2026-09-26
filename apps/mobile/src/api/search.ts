import type { SearchQuery, SearchResponse } from '@meetio/shared';
import { apiClient } from './axios-client';

/**
 * `GET /search` — semantic search over meeting transcripts (US-22). Types
 * come straight from `@meetio/shared` — nothing here redeclares the wire
 * shape. Per docs/api-spec.md §6 this can fail with 503
 * `AI_SERVICE_UNAVAILABLE` (Gemini not configured / all keys resting) or 429
 * `QUOTA_EXCEEDED`/`RATE_LIMITED` — callers read those off the rejected
 * promise via `error-messages.ts`.
 */
export async function searchTranscripts(query: SearchQuery): Promise<SearchResponse> {
  const { data } = await apiClient.get<SearchResponse>('/search', { params: query });
  return data;
}
