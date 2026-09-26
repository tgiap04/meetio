import type { LoggerService, LogLevel } from '@nestjs/common';
import { errorCode, stackFrames } from './log-error.js';

/**
 * Structured fields a log line may carry (NFR-11). An allowlist, not a denylist: anything else a
 * caller passes is dropped, so transcript text, prompts, questions, answers or tokens cannot reach
 * the log by being attached as a field (NFR-04). Free-text messages are written by our code and
 * must stay content-free — the e2e log scan enforces that.
 */
export const LOG_FIELDS = new Set([
  'event', 'request_id', 'user_id', 'meeting_id', 'step', 'run', 'attempt', 'duration_ms', 'outcome',
  'status', 'method', 'route', 'operation', 'count', 'error_code', 'tokens',
]);

export type LogFields = Partial<Record<string, string | number | boolean | null>>;

/** Keeps only allowlisted fields with primitive values. */
export function pickLogFields(fields: Record<string, unknown>): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (LOG_FIELDS.has(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v))) out[k] = v as string | number | boolean | null;
  }
  return out;
}

/**
 * One JSON object per line: `{time, level, context, msg, ...fields}`. `logger.log({event: 'x', ...})`
 * logs structured fields; a string logs as `msg`. Used when `LOG_FORMAT=json` (the default in
 * production) — see `useJsonLogs`.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {}

  log(message: unknown, ...rest: unknown[]) {
    this.emit('info', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.emit('error', message, rest, true);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.emit('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.emit('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.emit('verbose', message, rest);
  }

  private emit(level: LogLevel | 'info', message: unknown, rest: unknown[], withStack = false) {
    // Nest passes the context last; `error()` passes the stack before it.
    const context = typeof rest[rest.length - 1] === 'string' ? (rest[rest.length - 1] as string) : undefined;
    // Stack frames only: the first line of a stack is the error message, which can carry data (NFR-04).
    const stack = withStack && rest.length > 1 ? stackFrames(rest[0]) : undefined;
    const base = { time: new Date().toISOString(), level, context };
    const body =
      message !== null && typeof message === 'object' && !(message instanceof Error)
        ? pickLogFields(message as Record<string, unknown>)
        : { msg: message instanceof Error ? errorCode(message) : String(message) };
    this.write(JSON.stringify({ ...base, ...body, ...(stack ? { stack } : {}) }));
  }
}

export const useJsonLogs = (env: NodeJS.ProcessEnv = process.env) =>
  (env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json';
