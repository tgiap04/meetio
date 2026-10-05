import { AudioRingBuffer } from './stt-audio-ring-buffer.js';

const bytes = (n: number, fill: number) => Buffer.alloc(n, fill);

describe('AudioRingBuffer', () => {
  it('keeps at most maxBytes, dropping the oldest audio first', () => {
    const ring = new AudioRingBuffer(10);
    ring.push(bytes(6, 1));
    ring.push(bytes(6, 2));
    expect(ring.size).toBe(10);
    expect([...ring.tail(10)]).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
  });

  it('returns only the newest requested bytes, rounded down to whole 16-bit samples', () => {
    const ring = new AudioRingBuffer(100);
    ring.push(bytes(4, 1));
    ring.push(bytes(4, 2));
    expect([...ring.tail(5)]).toEqual([2, 2, 2, 2]);
    expect(ring.tail(0)).toHaveLength(0);
  });

  it('drops everything on clear', () => {
    const ring = new AudioRingBuffer(10);
    ring.push(bytes(4, 1));
    ring.clear();
    expect(ring.size).toBe(0);
  });

  it('copes with one frame larger than the whole buffer', () => {
    const ring = new AudioRingBuffer(4);
    ring.push(Buffer.from([1, 1, 2, 2, 3, 3]));
    expect([...ring.tail(10)]).toEqual([2, 2, 3, 3]);
  });
});
