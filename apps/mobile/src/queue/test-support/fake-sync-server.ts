import { AxiosError, AxiosHeaders } from 'axios';
import type { CreateMeetingRequest, EndMeetingRequest, TranscriptSegmentPayload } from '@meetio/shared';
import { OwnerMismatchError } from '../../api/axios-client';
import type { SyncApi } from '../sync-worker';

/** An axios-shaped failure: no `status` = the request never got a response (offline). */
export function axiosFailure(status?: number, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    code ?? 'Network Error',
    status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK',
    config,
    {},
    status ? { status, statusText: '', headers: {}, config, data: { error: { code, message: code } } } : undefined,
  );
}

interface ServerMeeting {
  userBody: CreateMeetingRequest;
  status: 'recording' | 'paused' | 'queued';
  segments: Map<number, string>;
  transitions: { op: string; at?: string; last_seq?: number }[];
}

/**
 * Test-only model of the server contract the sync worker relies on: create idempotent on id,
 * transitions validated like the real state machine, bulk upsert keeping the first copy of a seq,
 * `end` refusing while a seq in 1..last_seq is missing.
 */
export class FakeSyncServer implements SyncApi {
  meetings = new Map<string, ServerMeeting>();
  offline = false;
  /** Who the current access token belongs to — a call on behalf of anyone else is refused on the device. */
  signedIn = 'u1';
  /** Owner each meeting was created under on the server. */
  ownerOf = new Map<string, string>();
  /** Next call to this method fails with this error, once. */
  failNext: Partial<Record<keyof SyncApi, AxiosError>> = {};
  calls: string[] = [];

  /** Resolves before the call runs — lets a test switch accounts while a call is in flight. */
  before: (() => Promise<void>) | null = null;

  private async gate(method: keyof SyncApi, ownerId: string) {
    this.calls.push(method);
    if (this.before) await this.before();
    // What the axios interceptor does with `expectedOwnerId`, at the moment the token is attached.
    if (ownerId !== this.signedIn) throw new OwnerMismatchError();
    if (this.offline) throw axiosFailure();
    const planned = this.failNext[method];
    if (planned) {
      delete this.failNext[method];
      throw planned;
    }
  }

  private find(id: string): ServerMeeting {
    const m = this.meetings.get(id);
    if (!m) throw axiosFailure(404, 'MEETING_NOT_FOUND');
    return m;
  }

  async createMeeting(ownerId: string, body: CreateMeetingRequest) {
    await this.gate('createMeeting', ownerId);
    const id = body.id!;
    if (!this.meetings.has(id)) {
      this.meetings.set(id, { userBody: body, status: 'recording', segments: new Map(), transitions: [] });
      this.ownerOf.set(id, this.signedIn);
    }
    return { id, status: this.find(id).status, started_at: body.started_at! };
  }

  async transitionMeeting(id: string, op: 'pause' | 'resume' | 'end', body: EndMeetingRequest, ownerId: string) {
    await this.gate('transitionMeeting', ownerId);
    const m = this.find(id);
    const allowed = { pause: m.status === 'recording', resume: m.status === 'paused', end: m.status !== 'queued' }[op];
    if (!allowed) throw axiosFailure(409, 'INVALID_STATE_TRANSITION');
    if (op === 'end' && body.last_seq) {
      for (let seq = 1; seq <= body.last_seq; seq++) if (!m.segments.has(seq)) throw axiosFailure(409, 'SEGMENTS_PENDING');
    }
    m.transitions.push({ op, ...body });
    m.status = op === 'pause' ? 'paused' : op === 'resume' ? 'recording' : 'queued';
    return { id, status: m.status, duration_sec: null };
  }

  async bulkUpsertSegments(ownerId: string, id: string, segments: TranscriptSegmentPayload[]) {
    await this.gate('bulkUpsertSegments', ownerId);
    const m = this.find(id);
    for (const s of segments) if (!m.segments.has(s.seq)) m.segments.set(s.seq, s.text);
    return segments.map((s) => s.seq);
  }

  /** What a socket `transcript_segment` does server-side before the ack is emitted. */
  receiveSocketSegment(id: string, segment: TranscriptSegmentPayload) {
    const m = this.find(id);
    if (!m.segments.has(segment.seq)) m.segments.set(segment.seq, segment.text);
  }
}
