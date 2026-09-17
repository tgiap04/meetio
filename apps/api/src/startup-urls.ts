/**
 * Turns the address Nest actually bound to into something worth printing.
 *
 * `app.getUrl()` reports the literal bind address, which is usually not a URL a
 * human can click: listening on every interface shows up as `http://[::1]:3000`,
 * `http://[::]:3000` or `http://0.0.0.0:3000`. Those are correct and useless — so
 * wildcard and loopback hosts collapse to `localhost`.
 *
 * A specific host is left alone. Binding to one interface on purpose (a LAN IP, a
 * container hostname) means that address is the meaningful one, and rewriting it
 * would hide the very thing the operator chose.
 */
export function toDisplayUrl(rawUrl: string): string {
  const withoutTrailingSlash = rawUrl.replace(/\/+$/, '');

  let parsed: URL;
  try {
    parsed = new URL(withoutTrailingSlash);
  } catch {
    // Never let a log line break startup.
    return withoutTrailingSlash;
  }

  // URL keeps IPv6 hosts bracketed, e.g. "[::1]".
  const wildcardOrLoopback = new Set(['[::]', '[::1]', '0.0.0.0', '127.0.0.1', '::', '::1']);
  if (wildcardOrLoopback.has(parsed.hostname) || wildcardOrLoopback.has(parsed.host)) {
    parsed.hostname = 'localhost';
  }

  return parsed.toString().replace(/\/+$/, '');
}

/** The lines printed once the server is listening. */
export interface StartupUrls {
  api: string;
  docs: string | null;
}

/**
 * Builds the URLs to advertise at boot. `docs` is null when Swagger is not served,
 * so the caller never prints a link to a route that answers 404.
 */
export function buildStartupUrls(
  rawUrl: string,
  globalPrefix: string,
  swaggerPath: string | null,
): StartupUrls {
  const base = toDisplayUrl(rawUrl);
  const prefix = globalPrefix.replace(/^\/+|\/+$/g, '');

  return {
    api: prefix ? `${base}/${prefix}` : base,
    docs: swaggerPath === null ? null : `${base}/${swaggerPath.replace(/^\/+/, '')}`,
  };
}
