import { jest } from '@jest/globals';
import { ApiErrorCode } from '@meetio/shared';
import { SegmentIngestHandler } from './segment-ingest.handler.js';
import { SegmentRejectedError } from '../segments/segment-rejected.error.js';
import type { SegmentBatchWriter } from '../segments/segment-batch-writer.service.js';
import type { SegmentRateLimiter } from './segment-rate-limiter.js';
import type { MeetingSocketData } from './ws-auth.middleware.js';

const NOW = 1_800_000_000_000;
const valid = { seq: 7, text: 'xin chào', started_at_ms: 1000, ended_at_ms: 2000 };

function setup() {
  const write = jest.fn(async (): Promise<void> => undefined);
  const allow = jest.fn(async (): Promise<boolean> => true);
  const handler = new SegmentIngestHandler({ write } as unknown as SegmentBatchWriter, { allow } as unknown as SegmentRateLimiter);
  const socket: MeetingSocketData = { userId: 'u1', tokenExp: NOW / 1000 + 600, meetingId: 'm1' };
  return { handler, write, allow, socket };
}

describe('SegmentIngestHandler', () => {
  it('acks only after the writer resolves', async () => {
    const t = setup();
    let release!: () => void;
    t.write.mockImplementation(() => new Promise<void>((r) => (release = r)));
    let outcome: unknown = null;
    const pending = t.handler.handle(t.socket, valid, NOW).then((o) => (outcome = o));
    await new Promise((r) => setImmediate(r));
    expect(outcome).toBeNull();
    release();
    await pending;
    expect(outcome).toEqual({ kind: 'ack', seq: 7 });
    expect(t.write).toHaveBeenCalledWith('m1', { ...valid, gap_before_ms: undefined });
  });

  it('turns a write failure into segment_error, never an ack', async () => {
    const t = setup();
    t.write.mockRejectedValue(new Error('connection reset'));
    const outcome = await t.handler.handle(t.socket, valid, NOW);
    expect(outcome).toEqual({ kind: 'error', payload: expect.objectContaining({ seq: 7, code: ApiErrorCode.INTERNAL_ERROR }), disconnect: false });
  });

  it('passes through a deliberate rejection code', async () => {
    const t = setup();
    t.write.mockRejectedValue(new SegmentRejectedError(ApiErrorCode.INVALID_STATE_TRANSITION, 'processing'));
    const outcome = await t.handler.handle(t.socket, valid, NOW);
    expect(outcome.kind === 'error' && outcome.payload.code).toBe(ApiErrorCode.INVALID_STATE_TRANSITION);
  });

  it('refuses segments before join_meeting', async () => {
    const t = setup();
    const outcome = await t.handler.handle({ ...t.socket, meetingId: undefined }, valid, NOW);
    expect(outcome.kind === 'error' && outcome.payload.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(t.write).not.toHaveBeenCalled();
  });

  it.each([
    ['missing text', { ...valid, text: undefined }],
    ['empty text', { ...valid, text: '' }],
    ['seq 0', { ...valid, seq: 0 }],
    ['fractional seq', { ...valid, seq: 1.5 }],
    ['ends before it starts', { ...valid, ended_at_ms: 500 }],
    ['negative gap', { ...valid, gap_before_ms: -1 }],
    ['not an object', 'hello'],
  ])('rejects %s with VALIDATION_ERROR without writing', async (_, payload) => {
    const t = setup();
    const outcome = await t.handler.handle(t.socket, payload, NOW);
    expect(outcome.kind === 'error' && outcome.payload.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(t.write).not.toHaveBeenCalled();
  });

  it('reports seq -1 when the payload has no usable seq', async () => {
    const t = setup();
    const outcome = await t.handler.handle(t.socket, { text: 'x' }, NOW);
    expect(outcome.kind === 'error' && outcome.payload.seq).toBe(-1);
  });

  it('refuses over the per-meeting rate limit', async () => {
    const t = setup();
    t.allow.mockResolvedValue(false);
    const outcome = await t.handler.handle(t.socket, valid, NOW);
    expect(outcome.kind === 'error' && outcome.payload.code).toBe(ApiErrorCode.RATE_LIMITED);
    expect(t.write).not.toHaveBeenCalled();
  });

  it('asks the client to reconnect once the handshake token has expired', async () => {
    const t = setup();
    const outcome = await t.handler.handle({ ...t.socket, tokenExp: NOW / 1000 }, valid, NOW);
    expect(outcome).toEqual({ kind: 'error', payload: expect.objectContaining({ code: ApiErrorCode.TOKEN_EXPIRED }), disconnect: true });
    expect(t.write).not.toHaveBeenCalled();
  });
});
