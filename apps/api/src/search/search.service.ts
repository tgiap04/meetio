import { Injectable } from '@nestjs/common';
import { VectorRepository } from '../database/vector.repository.js';
import { GeminiClient } from '../ai/gemini.client.js';
import { aiErrorToHttp } from '../ai/ai-http-error.js';
import type { SearchQueryDto, SearchResponseDto } from './dto/search.dto.js';

const DEFAULT_LIMIT = 10;
const EXCERPT_CHARS = 280;

export function excerptOf(content: string): string {
  if (content.length <= EXCERPT_CHARS) return content;
  const cut = content.lastIndexOf(' ', EXCERPT_CHARS);
  return `${content.slice(0, cut > EXCERPT_CHARS / 2 ? cut : EXCERPT_CHARS)}…`;
}

/** `GET /search` (US-22): embed the question, nearest chunks of the caller's own meetings. */
@Injectable()
export class SearchService {
  constructor(
    private readonly vectors: VectorRepository,
    private readonly gemini: GeminiClient,
  ) {}

  async search(userId: string, query: SearchQueryDto): Promise<SearchResponseDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    let vector: number[];
    try {
      ({ vectors: [vector] } = await this.gemini.embed({
        userId,
        meetingId: null,
        operation: 'search',
        texts: [query.q.trim()],
        taskType: 'RETRIEVAL_QUERY',
      }));
    } catch (error) {
      throw aiErrorToHttp(error);
    }
    // One extra row tells whether another page exists without a COUNT over the index.
    const rows = await this.vectors.searchChunks(userId, vector, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: limit + 1,
      offset,
    });
    return {
      items: rows.slice(0, limit).map((r) => ({
        chunk_id: r.chunkId,
        meeting_id: r.meetingId,
        meeting_title: r.meetingTitle,
        meeting_date: r.meetingStartedAt ? new Date(r.meetingStartedAt).toISOString() : null,
        excerpt: excerptOf(r.content),
        segment_seq: r.segmentStartSeq,
        segment_end_seq: r.segmentEndSeq,
        // Cosine distance is 0..2 for arbitrary vectors; for unit vectors 1 - d is the similarity.
        score: Math.max(0, Math.min(1, 1 - r.distance)),
      })),
      next_offset: rows.length > limit ? offset + limit : null,
    };
  }
}
