import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';

/** One Live session the API opened against the fake: what it asked for and what audio it was sent. */
export class FakeLiveSession {
  readonly audioChunks: Buffer[] = [];
  setup: { inputAudioTranscription?: { languageCodes?: string[]; mode?: string } } & Record<string, unknown> = {};
  audioStreamEnded = false;
  closed = false;

  constructor(
    readonly key: string,
    private readonly socket: WebSocket,
  ) {}

  get audioBytes(): number {
    return this.audioChunks.reduce((n, c) => n + c.length, 0);
  }

  interim(text: string): void {
    this.send({ serverContent: { interimInputTranscription: { text } } });
  }

  final(text: string): void {
    this.send({ serverContent: { inputTranscription: { text } } });
  }

  goAway(): void {
    this.send({ goAway: { timeLeft: '30s' } });
  }

  /** The server drops the connection (an unexpected close from the API's point of view). */
  drop(code = 1011): void {
    this.socket.close(code, 'fake drop');
  }

  private send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }
}

/**
 * Speaks the slice of Gemini's Live WebSocket protocol the API uses (setup → setupComplete,
 * realtimeInput audio / audioStreamEnd, serverContent transcriptions), attached to the fake
 * Gemini HTTP server so the compiled API reaches it through GEMINI_BASE_URL like the real one.
 * Tests speak for Gemini with `sessions[i].interim/final`.
 */
export class FakeGeminiLive {
  readonly sessions: FakeLiveSession[] = [];
  /** While set, Live connections are refused with this HTTP status (Gemini unavailable). */
  refuseWith: number | null = null;
  /** When set, `audioStreamEnd` is answered with this final (Gemini settling its last words). */
  finalOnEnd: string | null = null;
  private readonly wss = new WebSocketServer({ noServer: true });

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!req.url?.includes('BidiGenerateContent')) {
        socket.destroy();
        return;
      }
      if (this.refuseWith) {
        socket.end(`HTTP/1.1 ${this.refuseWith} Refused\r\nConnection: close\r\n\r\n`);
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, new URL(req.url!, 'http://fake').searchParams.get('key') ?? ''));
    });
  }

  close(): void {
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  /** Sessions the API has not closed. */
  get open(): FakeLiveSession[] {
    return this.sessions.filter((s) => !s.closed);
  }

  private accept(ws: WebSocket, key: string): void {
    const session = new FakeLiveSession(key, ws);
    this.sessions.push(session);
    ws.on('close', () => {
      session.closed = true;
    });
    ws.on('message', (raw: Buffer) => {
      const message = JSON.parse(raw.toString()) as {
        setup?: FakeLiveSession['setup'];
        realtimeInput?: { audio?: { data: string; mimeType: string }; audioStreamEnd?: boolean };
      };
      if (message.setup) {
        session.setup = message.setup;
        ws.send(JSON.stringify({ setupComplete: {} }));
      }
      const input = message.realtimeInput;
      if (input?.audio) session.audioChunks.push(Buffer.from(input.audio.data, 'base64'));
      if (input?.audioStreamEnd) {
        session.audioStreamEnded = true;
        if (this.finalOnEnd) session.final(this.finalOnEnd);
      }
    });
  }
}
