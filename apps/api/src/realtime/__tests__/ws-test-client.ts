import { io, type Socket } from 'socket.io-client';

export interface SegmentReply {
  event: 'segment_ack' | 'segment_error';
  seq: number;
  code?: string;
}

/** A socket.io client for `/meeting-room` that records every ack/error it receives, in order. */
export class WsTestClient {
  readonly replies: SegmentReply[] = [];
  private constructor(readonly socket: Socket) {
    socket.on('segment_ack', (p: { seq: number }) =>
      this.replies.push({ event: 'segment_ack', seq: p.seq }),
    );
    socket.on('segment_error', (p: { seq: number; code: string }) =>
      this.replies.push({ event: 'segment_error', seq: p.seq, code: p.code }),
    );
  }

  static connect(baseUrl: string, token: string | undefined): Promise<WsTestClient> {
    const socket = io(`${baseUrl}/meeting-room`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(new WsTestClient(socket)));
      socket.once('connect_error', (err: Error & { data?: { code?: string } }) => {
        socket.close();
        reject(Object.assign(err, { code: err.data?.code }));
      });
    });
  }

  join(meetingId: string): Promise<{ ok: boolean; error?: { code: string } }> {
    return this.socket.timeout(5000).emitWithAck('join_meeting', { meeting_id: meetingId });
  }

  leave(meetingId: string): Promise<{ ok: boolean }> {
    return this.socket.timeout(5000).emitWithAck('leave_meeting', { meeting_id: meetingId });
  }

  send(seq: number, text = `đoạn ${seq}`): void {
    this.socket.emit('transcript_segment', {
      seq,
      text,
      started_at_ms: seq * 1000,
      ended_at_ms: seq * 1000 + 900,
    });
  }

  /** Resolves once `count` replies (acks or errors) have arrived in total. */
  async waitForReplies(count: number, timeoutMs = 10_000): Promise<SegmentReply[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.replies.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`Only ${this.replies.length}/${count} replies after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return this.replies;
  }

  close(): void {
    this.socket.close();
  }
}
