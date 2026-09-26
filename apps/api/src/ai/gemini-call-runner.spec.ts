import { GeminiCallRunner } from './gemini-call-runner.js';
import { GeminiKeyPool } from './gemini-key-pool.js';
import { AiServiceUnavailableError } from './ai-errors.js';

const err = (status: number | undefined, message = 'x') => Object.assign(new Error(message), status === undefined ? {} : { status });

function setup(keys: string[], maxConcurrency = 4) {
  const logs: string[] = [];
  const pool = new GeminiKeyPool(keys, { defaultCooldownMs: 60_000 });
  const runner = new GeminiCallRunner(pool, { maxConcurrency, retries: 2, retryBaseMs: 1, log: (m) => logs.push(m) });
  return { runner, logs };
}

describe('GeminiCallRunner', () => {
  it('moves a rate-limited call straight to the next key, and logs only the key position', async () => {
    const { runner, logs } = setup(['secret-1', 'secret-2']);
    const used: string[] = [];
    const result = await runner.run(undefined, async (key) => {
      used.push(key);
      if (key === 'secret-1') throw err(429);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(used).toEqual(['secret-1', 'secret-2']);
    expect(logs.join(' ')).toContain('key #1');
    expect(logs.join(' ')).not.toContain('secret');
  });

  it('keeps later calls off the resting key', async () => {
    const { runner } = setup(['a', 'b']);
    await runner.run(undefined, async (k) => {
      if (k === 'a') throw err(429);
      return k;
    });
    const next = await Promise.all([1, 2, 3].map(() => runner.run(undefined, async (k) => k)));
    expect(next).toEqual(['b', 'b', 'b']);
  });

  it('fails as retryable once every key is resting', async () => {
    const { runner } = setup(['a', 'b']);
    await expect(runner.run(undefined, async () => Promise.reject(err(429)))).rejects.toThrow(/tạm nghỉ/);
  });

  it('drops a key Gemini rejects as invalid and uses the others', async () => {
    const { runner, logs } = setup(['bad', 'good']);
    const calls: string[] = [];
    const run = () =>
      runner.run(undefined, async (k) => {
        calls.push(k);
        if (k === 'bad') throw err(400, 'API key not valid. Please pass a valid API key. API_KEY_INVALID');
        return k;
      });
    expect(await run()).toBe('good');
    expect(await run()).toBe('good');
    expect(calls).toEqual(['bad', 'good', 'good']);
    expect(logs.join(' ')).toContain('#1 rejected as invalid');
  });

  it('keeps a key on a 403 that is not about the key (billing, API disabled) and reports it clearly', async () => {
    const { runner, logs } = setup(['only']);
    const denied = err(403, '{"error":{"code":403,"message":"Billing is disabled","status":"PERMISSION_DENIED"}}');
    await expect(runner.run(undefined, async () => Promise.reject(denied))).rejects.toThrow(/HTTP 403/);
    // the key is still in the pool: the next call reaches it
    await expect(runner.run(undefined, async (k) => k)).resolves.toBe('only');
    expect(logs.join(' ')).toContain('key kept');
  });

  it('retries server and network errors with backoff, then gives up', async () => {
    const { runner } = setup(['a']);
    let n = 0;
    await expect(
      runner.run(undefined, async () => {
        n++;
        throw err(n === 1 ? undefined : 503);
      }),
    ).rejects.toBeInstanceOf(AiServiceUnavailableError);
    expect(n).toBe(3);
  });

  it('passes other client errors straight to the caller', async () => {
    const { runner } = setup(['a', 'b']);
    let n = 0;
    await expect(runner.run(undefined, async () => { n++; throw err(400, 'bad request'); })).rejects.toThrow('bad request');
    expect(n).toBe(1);
  });

  it('bounds concurrency and lets an aborted waiter leave the queue', async () => {
    const { runner } = setup(['a'], 1);
    let release!: () => void;
    const first = runner.run(undefined, () => new Promise<string>((r) => (release = () => r('first'))));
    const controller = new AbortController();
    const second = runner.run(controller.signal, async () => 'second');
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(second).rejects.toBeInstanceOf(AiServiceUnavailableError);
    release();
    expect(await first).toBe('first');
    const pre = new AbortController();
    pre.abort();
    await expect(runner.run(pre.signal, async () => 'never')).rejects.toBeInstanceOf(AiServiceUnavailableError);
  });
});
