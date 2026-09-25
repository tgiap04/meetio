import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../analyze-run.mjs', import.meta.url));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'stt-spike-'));
  const reference = join(dir, 'reference.txt');
  const log = join(dir, 'run.jsonl');
  writeFileSync(reference, '[00:00] chào mọi người\n[00:03] bắt đầu họp\n');
  const t = 1_700_000_000_000;
  const events = [
    {
      event: 'run_meta',
      timestamp: t,
      device: 'Pixel 7',
      os: 'android 16',
      engine: 'on-device',
      app_state: 'locked',
      placement: 'laptop-speaker',
      distance_cm: 50,
    },
    { event: 'start', timestamp: t + 10, session_id: 's1' },
    { event: 'mark_playback', timestamp: t + 20 },
    { event: 'final', timestamp: t + 5000, session_id: 's1', text: 'chào mọi người bắt đầu họp' },
    { event: 'user_stop', timestamp: t + 6000, session_id: 's1' },
    { event: 'run_stop', timestamp: t + 6000, session_id: 's1' },
  ];
  writeFileSync(log, events.map((e) => JSON.stringify(e)).join('\n'));
  return { reference, log };
}

test('in dòng bảng Markdown khớp số cột của tiêu đề', () => {
  const { reference, log } = fixture();
  const out = execFileSync('node', [CLI, '--reference', reference, '--format', 'md', log], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const columns = (line) => line.split('|').length;
  assert.equal(out.length, 3);
  assert.equal(columns(out[2]), columns(out[0]));
  assert.match(out[2], /Pixel 7 \| android 16 \| on-device \| locked \| laptop-speaker \| 50cm/);
  assert.match(out[2], /\| 0\.0% \|$/); // WER 0
});

test('json và text đều chạy được', () => {
  const { reference, log } = fixture();
  const json = JSON.parse(
    execFileSync('node', [CLI, '-r', reference, '-f', 'json', log], { encoding: 'utf8' }),
  );
  assert.equal(json[0].metrics.wer.wer, 0);
  assert.match(
    execFileSync('node', [CLI, '-r', reference, log], { encoding: 'utf8' }),
    /WER 0\.0%/,
  );
});

test('thiếu tham số thì thoát mã 2', () => {
  assert.equal(spawnSync('node', [CLI]).status, 2);
  const { reference, log } = fixture();
  assert.equal(spawnSync('node', [CLI, '-r', reference, '-f', 'xml', log]).status, 2);
});
