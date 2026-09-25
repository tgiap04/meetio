import { createServer, type Server } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { ExpoPushClient } from './expo-push.client.js';

const message = { to: 'ExponentPushToken[aaaaaaaa]', title: 't', body: 'b', data: {} };

describe('ExpoPushClient', () => {
  let server: Server;
  let url: string;
  let replies: number[];
  let hits: number;

  beforeEach(async () => {
    hits = 0;
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const status = replies[Math.min(hits, replies.length - 1)];
        hits++;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(status === 200 ? JSON.stringify({ data: [{ status: 'ok', id: 'x' }] }) : '{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as { port: number }).port}`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const client = () =>
    new ExpoPushClient({ get: (k: string) => ({ EXPO_PUSH_URL: url, EXPO_PUSH_RETRY_BASE_MS: '5' })[k] } as unknown as ConfigService);

  it('retries a throttled request and delivers', async () => {
    replies = [429, 503, 200];
    expect(await client().send([message])).toEqual([{ status: 'ok', id: 'x' }]);
    expect(hits).toBe(3);
  });

  it('does not retry a client error and reports it per message', async () => {
    replies = [400];
    expect(await client().send([message])).toEqual([{ status: 'error', message: 'HTTP 400' }]);
    expect(hits).toBe(1);
  });

  it('gives up after three tries', async () => {
    replies = [500];
    expect((await client().send([message]))[0].status).toBe('error');
    expect(hits).toBe(3);
  });
});
