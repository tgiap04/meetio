import { createServer, type Server } from 'node:http';

export interface CapturedPush {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Stands in for Expo's push endpoint over real HTTP, so the API's actual push
 * path runs end to end without sending anything outside the machine.
 * Tokens containing "Gone" are answered with DeviceNotRegistered.
 */
export class PushCaptureServer {
  readonly received: CapturedPush[] = [];
  private server!: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const messages = JSON.parse(raw) as CapturedPush[];
        this.received.push(...messages);
        const data = messages.map((m) =>
          m.to.includes('Gone') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket' },
        );
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data }));
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    this.url = `http://localhost:${(this.server.address() as { port: number }).port}/push`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}
