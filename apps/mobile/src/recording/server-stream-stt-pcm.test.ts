import { createPcmConverter, pcmVolume } from './server-stream-stt-pcm';

const ints = (...v: number[]) => Int16Array.from(v);

describe('createPcmConverter', () => {
  it('passes 16 kHz mono through untouched', () => {
    const convert = createPcmConverter();
    const input = ints(1, 2, 3, 4);
    expect([...convert(input.buffer as ArrayBuffer, 16_000, 1)]).toEqual([1, 2, 3, 4]);
  });

  it('downmixes interleaved stereo by averaging the channels', () => {
    const convert = createPcmConverter();
    expect([...convert(ints(100, 300, -200, 200).buffer as ArrayBuffer, 16_000, 2)]).toEqual([200, 0]);
  });

  it('resamples 48 kHz to 16 kHz (every third sample for a ramp)', () => {
    const convert = createPcmConverter();
    const ramp = Int16Array.from({ length: 12 }, (_, i) => i * 3);
    expect([...convert(ramp.buffer as ArrayBuffer, 48_000, 1)]).toEqual([0, 9, 18, 27]);
  });

  it('interpolates for a non-integer ratio and stays continuous across buffers', () => {
    const whole = Int16Array.from({ length: 441 }, (_, i) => i * 10);
    const oneShot = [...createPcmConverter()(whole.buffer as ArrayBuffer, 44_100, 1)];
    const convert = createPcmConverter();
    const split = [
      ...convert(whole.slice(0, 200).buffer as ArrayBuffer, 44_100, 1),
      ...convert(whole.slice(200, 441).buffer as ArrayBuffer, 44_100, 1),
    ];
    // Same samples either way (float position drift may flip a rounding by one).
    expect(split).toHaveLength(oneShot.length);
    split.forEach((v, i) => expect(Math.abs(v - oneShot[i])).toBeLessThanOrEqual(1));
    // 441 samples at 44.1 kHz = 10 ms = ~160 output samples; each is a point on the ramp.
    expect(oneShot.length).toBeGreaterThanOrEqual(159);
    expect(oneShot.length).toBeLessThanOrEqual(160);
    expect(oneShot[1]).toBeCloseTo(10 * (44_100 / 16_000), 0);
  });

  it('copes with a buffer holding fewer samples than one output step', () => {
    const convert = createPcmConverter();
    const out = [...convert(ints(0, 3).buffer as ArrayBuffer, 48_000, 1), ...convert(ints(6, 9, 12, 15).buffer as ArrayBuffer, 48_000, 1)];
    expect(out).toEqual([0, 9]);
  });

  it('ignores a trailing odd byte', () => {
    const convert = createPcmConverter();
    expect(convert(new ArrayBuffer(5), 16_000, 1)).toHaveLength(2);
  });
});

describe('pcmVolume', () => {
  it('maps silence to -2 and a full-scale signal near the top of the scale', () => {
    expect(pcmVolume(new Int16Array(160))).toBe(-2);
    expect(pcmVolume(Int16Array.from({ length: 160 }, () => 32_767))).toBeGreaterThan(9.9);
  });

  it('maps speech-level input into the middle of the scale', () => {
    const level = pcmVolume(Int16Array.from({ length: 160 }, (_, i) => (i % 2 ? 1000 : -1000)));
    expect(level).toBeGreaterThan(2);
    expect(level).toBeLessThan(8);
  });

  it('handles an empty buffer', () => {
    expect(pcmVolume(new Int16Array(0))).toBe(-2);
  });
});
