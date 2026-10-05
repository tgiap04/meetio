import { createUplink } from './server-stream-stt-uplink';

const ms = (n: number, fill = 1) => new Int16Array(n * 16).fill(fill);

describe('createUplink', () => {
  it('cuts the audio into whole frames and keeps the remainder', () => {
    const sent: number[] = [];
    const uplink = createUplink((f) => sent.push(f.byteLength), 100, 1000);
    uplink.push(ms(60));
    expect(sent).toEqual([]);
    uplink.push(ms(250));
    expect(sent).toEqual([3200, 3200, 3200]); // 310 ms → three 100 ms frames
    uplink.flush();
    expect(sent.at(-1)).toBe(320);
  });

  it('sends nothing while offline, keeps the newest audio and counts what it dropped', () => {
    const sent: Int16Array[] = [];
    const uplink = createUplink((f) => sent.push(new Int16Array(f)), 100, 300);
    uplink.setOnline(false);
    uplink.push(ms(200, 1));
    uplink.push(ms(200, 2));
    expect(sent).toHaveLength(0);
    expect(uplink.takeDroppedMs()).toBe(100);
    expect(uplink.takeDroppedMs()).toBe(0);
    uplink.setOnline(true);
    expect(sent.map((f) => f[0])).toEqual([1, 2, 2]);
  });

  it('ignores empty pushes and flush while offline', () => {
    const sent: ArrayBuffer[] = [];
    const uplink = createUplink((f) => sent.push(f), 100, 300);
    uplink.push(new Int16Array(0));
    uplink.setOnline(false);
    uplink.push(ms(50));
    uplink.flush();
    expect(sent).toHaveLength(0);
  });
});
