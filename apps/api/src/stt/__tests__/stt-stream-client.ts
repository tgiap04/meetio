import { io, type Socket } from 'socket.io-client';
import type { SttStreamAck } from '@meetio/shared';

export type StreamEvent = { event: 'stt_partial' | 'stt_final'; text: string } | { event: 'stt_error'; code: string };

/** A socket.io client for `/stt-stream` that records every partial, final and error in order. */
export class SttStreamTestClient {
  readonly events: StreamEvent[] = [];
  private constructor(readonly socket: Socket) {
    socket.on('stt_partial', (p: { text: string }) => this.events.push({ event: 'stt_partial', text: p.text }));
    socket.on('stt_final', (p: { text: string }) => this.events.push({ event: 'stt_final', text: p.text }));
    socket.on('stt_error', (p: { code: string }) => this.events.push({ event: 'stt_error', code: p.code }));
  }

  static connect(baseUrl: string, token: string | undefined): Promise<SttStreamTestClient> {
    const socket = io(`${baseUrl}/stt-stream`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(new SttStreamTestClient(socket)));
      socket.once('connect_error', (err: Error & { data?: { code?: string } }) => {
        socket.close();
        reject(Object.assign(err, { code: err.data?.code }));
      });
    });
  }

  start(body: unknown): Promise<SttStreamAck> {
    return this.socket.timeout(10_000).emitWithAck('stt_start', body);
  }

  audio(bytes: number | Buffer): void {
    this.socket.emit('stt_audio', typeof bytes === 'number' ? Buffer.alloc(bytes, 1) : bytes);
  }

  stop(): Promise<SttStreamAck> {
    return this.socket.timeout(10_000).emitWithAck('stt_stop');
  }

  /** Resolves when an event matching `predicate` is among the recorded ones. */
  async waitFor(predicate: (e: StreamEvent) => boolean, timeoutMs = 10_000): Promise<StreamEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.events.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`No matching event after ${timeoutMs}ms; got ${JSON.stringify(this.events)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  close(): void {
    this.socket.close();
  }
}

export async function until(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
