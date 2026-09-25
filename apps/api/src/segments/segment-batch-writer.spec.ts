import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { SegmentBatchWriter } from './segment-batch-writer.service.js';
import type { SegmentUpsertRepository } from './segment-upsert.repository.js';
import type { SegmentInput } from './segment-input.js';

const seg = (seq: number, text = `đoạn ${seq}`): SegmentInput => ({ seq, text, started_at_ms: seq * 1000, ended_at_ms: seq * 1000 + 900 });

function setup(windowMs = '200') {
  const written: { meetingId: string; seqs: number[] }[] = [];
  let failNext: Error | null = null;
  let release: (() => void) | null = null;
  let hold = false;
  const upsertMany = jest.fn(async (meetingId: string, segments: readonly SegmentInput[]) => {
    if (hold) {
      await new Promise<void>((r) => (release = r));
    }
    if (failNext) {
      const e = failNext;
      failNext = null;
      throw e;
    }
    written.push({ meetingId, seqs: segments.map((s) => s.seq) });
  });
  const config = { get: () => windowMs } as unknown as ConfigService;
  const writer = new SegmentBatchWriter({ upsertMany } as unknown as SegmentUpsertRepository, config);
  return {
    writer,
    upsertMany,
    written,
    failOnce: (e: Error) => (failNext = e),
    holdWrites: () => (hold = true),
    releaseWrite: () => {
      hold = false;
      release?.();
    },
  };
}

describe('SegmentBatchWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('writes nothing until the window closes, then one statement for the whole window', async () => {
    const t = setup();
    const acks = [t.writer.write('m1', seg(1)), t.writer.write('m1', seg(2)), t.writer.write('m1', seg(3))];
    jest.advanceTimersByTime(199);
    expect(t.upsertMany).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.all(acks);
    expect(t.written).toEqual([{ meetingId: 'm1', seqs: [1, 2, 3] }]);
  });

  it('resolves a write only after its batch is persisted', async () => {
    const t = setup();
    t.holdWrites();
    let acked = false;
    const done = t.writer.write('m1', seg(1)).then(() => (acked = true));
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(t.upsertMany).toHaveBeenCalled();
    expect(acked).toBe(false);
    t.releaseWrite();
    await done;
    expect(acked).toBe(true);
  });

  it('rejects every write in a failed batch, so none of them is acked', async () => {
    const t = setup();
    t.failOnce(new Error('db down'));
    const writes = [t.writer.write('m1', seg(1)), t.writer.write('m1', seg(2))];
    jest.advanceTimersByTime(200);
    const results = await Promise.allSettled(writes);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(t.written).toEqual([]);
  });

  it('collapses a seq repeated inside one window to the first copy', async () => {
    const t = setup();
    const acks = [t.writer.write('m1', seg(5, 'bản đầu')), t.writer.write('m1', seg(5, 'bản sau'))];
    jest.advanceTimersByTime(200);
    await Promise.all(acks);
    const sent = t.upsertMany.mock.calls[0][1];
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('bản đầu');
  });

  it('keeps meetings in separate batches', async () => {
    const t = setup();
    const acks = [t.writer.write('m1', seg(1)), t.writer.write('m2', seg(1))];
    jest.advanceTimersByTime(200);
    await Promise.all(acks);
    expect(t.written.map((w) => w.meetingId).sort()).toEqual(['m1', 'm2']);
  });

  it('flush writes the open window at once and waits for the batch already in flight', async () => {
    const t = setup();
    t.holdWrites();
    const first = t.writer.write('m1', seg(1));
    jest.advanceTimersByTime(200); // batch 1 in flight, held
    const second = t.writer.write('m1', seg(2)); // sits in a new window
    let flushed = false;
    const flushing = t.writer.flush('m1').then(() => (flushed = true));
    await Promise.resolve();
    expect(flushed).toBe(false);
    t.releaseWrite();
    await Promise.all([first, second, flushing]);
    expect(t.written.map((w) => w.seqs)).toEqual([[1], [2]]);
  });

  it('flush never rejects, even when the batch it waits for failed', async () => {
    const t = setup();
    t.failOnce(new Error('db down'));
    const write = t.writer.write('m1', seg(1)).catch(() => 'rejected');
    await expect(t.writer.flush('m1')).resolves.toBeUndefined();
    expect(await write).toBe('rejected');
  });

  it('writes immediately once a window holds 500 segments', async () => {
    const t = setup('10000');
    const acks = Array.from({ length: 500 }, (_, i) => t.writer.write('m1', seg(i + 1)));
    await Promise.all(acks);
    expect(t.written[0].seqs).toHaveLength(500);
  });

  it('falls back to 200ms for a missing or invalid window setting', async () => {
    const t = setup('not-a-number');
    const ack = t.writer.write('m1', seg(1));
    jest.advanceTimersByTime(199);
    expect(t.upsertMany).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await ack;
  });
});
