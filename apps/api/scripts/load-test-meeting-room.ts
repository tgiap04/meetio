/**
 * phase-05 step 8 — load test for `/meeting-room`: N concurrent meetings, each
 * sending R segments/second for D seconds, over real WebSockets against a
 * running API. Reports ack latency percentiles and verifies every seq landed
 * exactly once in PostgreSQL.
 *
 *   yarn workspace @meetio/api load-test [--meetings 20] [--rate 2] [--seconds 600] [--url http://localhost:3000]
 *
 * Talks to the API as a client would; needs DATABASE_URL (to create test users
 * and verify rows) and JWT_ACCESS_SECRET (to mint their tokens). Cleans up the
 * users — and by cascade their meetings — when done.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';

const { values } = parseArgs({
  options: {
    meetings: { type: 'string', default: '20' },
    rate: { type: 'string', default: '2' },
    seconds: { type: 'string', default: '600' },
    url: { type: 'string', default: process.env.LOAD_TEST_URL ?? 'http://localhost:3000' },
  },
});
const MEETINGS = Number(values.meetings);
const RATE = Number(values.rate);
const SECONDS = Number(values.seconds);
const BASE = values.url!;

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const secret = process.env.JWT_ACCESS_SECRET;
if (!process.env.DATABASE_URL || !secret) {
  throw new Error('DATABASE_URL and JWT_ACCESS_SECRET are required');
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

async function runMeeting(index: number, userId: string, token: string, latencies: number[]): Promise<{ meetingId: string; errors: string[] }> {
  const created = await fetch(`${BASE}/api/meetings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: `Load test ${index}`, source_language: 'vi-VN', audio_source: 'device_mic', recording_quality: 'standard' }),
  });
  const { id: meetingId } = (await created.json()) as { id: string };
  const socket: Socket = io(`${BASE}/meeting-room`, { auth: { token }, transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  await socket.timeout(5000).emitWithAck('join_meeting', { meeting_id: meetingId });

  const sentAt = new Map<number, number>();
  const errors: string[] = [];
  const total = RATE * SECONDS;
  let acked = 0;
  const allAcked = new Promise<void>((resolve) => {
    socket.on('segment_ack', ({ seq }: { seq: number }) => {
      latencies.push(performance.now() - sentAt.get(seq)!);
      if (++acked === total) resolve();
    });
  });
  socket.on('segment_error', ({ seq, code }: { seq: number; code: string }) => errors.push(`${seq}:${code}`));

  for (let seq = 1; seq <= total; seq++) {
    sentAt.set(seq, performance.now());
    socket.emit('transcript_segment', {
      seq,
      text: `Đoạn ${seq} của cuộc họp ${index} — nội dung mô phỏng một câu nói bình thường trong cuộc họp.`,
      started_at_ms: seq * 500,
      ended_at_ms: seq * 500 + 450,
    });
    await new Promise((r) => setTimeout(r, 1000 / RATE));
  }
  await Promise.race([allAcked, new Promise((r) => setTimeout(r, 10_000))]);
  socket.close();
  return { meetingId, errors };
}

async function main(): Promise<void> {
  const users = Array.from({ length: MEETINGS }, () => randomUUID());
  for (const id of users) {
    await db.query(`INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, 'Load', 'load-test-no-login')`, [
      id,
      `load-${id}@meetio.test`,
    ]);
  }
  console.log(`Load test: ${MEETINGS} meetings × ${RATE} seg/s × ${SECONDS}s against ${BASE}`);
  const latencies: number[] = [];
  const started = Date.now();
  try {
    const results = await Promise.all(
      users.map((id, i) => runMeeting(i, id, jwt.sign({ sub: id, jti: randomUUID() }, secret!, { expiresIn: SECONDS + 300 }), latencies)),
    );
    const expected = RATE * SECONDS;
    let missingOrDuplicated = 0;
    for (const { meetingId } of results) {
      const { rows } = await db.query('SELECT count(*)::int AS n, count(DISTINCT seq)::int AS d FROM transcript_segments WHERE meeting_id = $1', [meetingId]);
      if (rows[0].n !== expected || rows[0].d !== expected) missingOrDuplicated += 1;
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const errors = results.flatMap((r) => r.errors);
    console.log(
      JSON.stringify(
        {
          wall_seconds: Math.round((Date.now() - started) / 1000),
          segments_sent: MEETINGS * expected,
          acks: sorted.length,
          errors: errors.length,
          error_sample: errors.slice(0, 5),
          meetings_with_missing_or_duplicate_rows: missingOrDuplicated,
          ack_ms: { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), max: sorted.at(-1) },
        },
        null,
        2,
      ),
    );
    const p95 = percentile(sorted, 0.95);
    if (sorted.length !== MEETINGS * expected || errors.length > 0 || missingOrDuplicated > 0 || p95 >= 500) {
      process.exitCode = 1;
      console.error('FAIL: phase-05 requires every segment acked once, no errors, and p95 ack < 500ms');
    } else {
      console.log('PASS: every segment acked and stored exactly once, p95 ack < 500ms');
    }
  } finally {
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
