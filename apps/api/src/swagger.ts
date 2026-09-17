import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

/**
 * Decides whether Swagger UI should be served, from `SWAGGER_ENABLED`.
 *
 * | `SWAGGER_ENABLED`      | Result                                  |
 * |------------------------|-----------------------------------------|
 * | `true` / `1` / `yes` / `on` | served                             |
 * | unset or empty         | served only when `NODE_ENV !== 'production'` |
 * | anything else          | NOT served                              |
 *
 * Two deliberate properties, both about failing safe:
 *
 * 1. **Unset means off in production.** Swagger publishes the full shape of every
 *    endpoint, including auth. A deployment that forgets to set this must not leak
 *    that map, so the default is derived from `NODE_ENV` rather than being `true`.
 * 2. **An unrecognised value is off, not on.** A typo like `SWAGGER_ENABLED=ture`
 *    fails closed. Guessing that an unknown value means "enabled" would turn a typo
 *    into an information disclosure.
 *
 * Where the value actually comes from: `ConfigModule.forRoot({ envFilePath: '.env' })`
 * merges a `.env` found in the process CWD into `process.env` before this runs, and
 * dotenv does not overwrite variables already set. So precedence is
 * **real environment > `.env` in CWD > the NODE_ENV-derived default**. A container
 * that ships no `.env` therefore lands on the default — which is why that default has
 * to be the safe one.
 */
export function isSwaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SWAGGER_ENABLED?.trim().toLowerCase();

  if (raw === undefined || raw === '') {
    return env.NODE_ENV !== 'production';
  }

  return TRUTHY.has(raw);
}

/**
 * Shared OpenAPI document config — used by both the running app (setupSwagger) and
 * the standalone generator (generate-openapi.ts) so the two never drift apart.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Meetio API')
    .setDescription('AI meeting-room assistant — REST + WebSocket contract')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * Mounts Swagger UI at /api/docs with Bearer auth declared, per docs/api-spec.md
 * ("Xác thực: Bearer JWT trên mọi endpoint trừ mục 1") — but only when
 * {@link isSwaggerEnabled} allows it.
 *
 * When disabled nothing is mounted, so `/api/docs` falls through to the global
 * exception filter and answers `404 NOT_FOUND` — the same answer as any unknown
 * route, which does not confirm that a docs endpoint exists at all.
 *
 * Returns the document when mounted, or `null` when Swagger is off.
 *
 * Note this gates only the *served* UI. `generate-openapi.ts` calls
 * `buildOpenApiDocument` directly, so `yarn openapi:generate` keeps working in
 * every environment — it is a build-time tool, not an exposed surface.
 */
export function setupSwagger(app: INestApplication): OpenAPIObject | null {
  if (!isSwaggerEnabled()) {
    return null;
  }

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return document;
}
