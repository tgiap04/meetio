import { JsonLogger, pickLogFields, useJsonLogs } from './json-logger.js';

const capture = () => {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: new JsonLogger((l) => lines.push(JSON.parse(l))) };
};

describe('JsonLogger', () => {
  it('writes one JSON object per line with level, context and message', () => {
    const { lines, logger } = capture();
    logger.log('Gemini key pool: 3 key(s)', 'GeminiClient');
    expect(lines[0]).toMatchObject({ level: 'info', context: 'GeminiClient', msg: 'Gemini key pool: 3 key(s)' });
    expect(typeof lines[0].time).toBe('string');
  });

  it('keeps only allowlisted structured fields — content attached as a field never reaches the log (NFR-04)', () => {
    const { lines, logger } = capture();
    logger.log(
      { event: 'pipeline_step', meeting_id: 'm1', step: 'extract', duration_ms: 812, transcript: 'anh Bình nói về lương', prompt: 'x', token: 'eyJ…', nested: { a: 1 } },
      'PipelineEngine',
    );
    expect(lines[0]).toEqual({ time: expect.any(String), level: 'info', context: 'PipelineEngine', event: 'pipeline_step', meeting_id: 'm1', step: 'extract', duration_ms: 812 });
  });

  it('attaches only the stack frames to errors — the message line can carry data (NFR-04)', () => {
    const { lines, logger } = capture();
    const err = new Error('duplicate key: (content)=(lương chị Hạnh tăng 10%)');
    logger.error('retention delete failed for meeting m1', err.stack, 'Retention');
    expect(lines[0]).toMatchObject({ level: 'error', context: 'Retention', msg: 'retention delete failed for meeting m1' });
    expect(lines[0].stack).toMatch(/^\s+at /);
    expect(JSON.stringify(lines[0])).not.toContain('lương');
  });

  it('logs an Error passed as the message by its name only', () => {
    const { lines, logger } = capture();
    logger.warn(new TypeError('Cannot read "anh Bình nói"'), 'X');
    expect(lines[0]).toMatchObject({ msg: 'TypeError' });
  });

  it('drops non-primitive values of allowed fields', () => {
    expect(pickLogFields({ user_id: { id: 'x' }, status: 200 })).toEqual({ status: 200 });
  });

  it('is JSON by default in production and when LOG_FORMAT=json, readable text otherwise', () => {
    expect(useJsonLogs({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(useJsonLogs({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' } as NodeJS.ProcessEnv)).toBe(false);
    expect(useJsonLogs({ LOG_FORMAT: 'json' } as NodeJS.ProcessEnv)).toBe(true);
    expect(useJsonLogs({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('falls back to pretty mode when LOG_FORMAT is unset in development', () => {
    expect(useJsonLogs({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(useJsonLogs({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(useJsonLogs({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('respects LOG_FORMAT=pretty override even in production', () => {
    expect(useJsonLogs({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' } as NodeJS.ProcessEnv)).toBe(false);
  });
});
