/**
 * Error details that are safe to log (NFR-04). An error's MESSAGE can carry data — a model's answer,
 * a Postgres value, a provider's response body — so logs get the error's name and its stack FRAMES
 * (code locations), never the message line.
 */
export const errorCode = (error: unknown): string =>
  error instanceof Error ? error.name || error.constructor.name || 'Error' : typeof error;

export function stackFrames(stack: unknown): string | undefined {
  const text = stack instanceof Error ? stack.stack : typeof stack === 'string' ? stack : undefined;
  if (!text) return undefined;
  const frames = text.split('\n').filter((l) => /^\s+at\s/.test(l));
  return frames.length ? frames.join('\n') : undefined;
}
