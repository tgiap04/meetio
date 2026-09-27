/**
 * The user id (`sub`) inside an access token, or null if it cannot be read. Used only as a
 * client-side guard — the server still verifies the signature on every request.
 */
export function tokenSubject(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    // atob yields one char per byte; the payload is UTF-8.
    const json = decodeURIComponent(Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}
