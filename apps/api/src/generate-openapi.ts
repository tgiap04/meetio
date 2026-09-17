import 'reflect-metadata';
import './load-env.js';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './swagger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Generates openapi.json without starting an HTTP listener — used by CI and by
 * `yarn openapi:generate` to keep the committed/consumed schema honest against the DTOs.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const document = buildOpenApiDocument(app);
  const outPath = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`openapi.json written to ${outPath}`);
  await app.close();
}

generate()
  .then(() => {
    // `app.close()` is not enough to end the process: AppModule opens Redis
    // connections (throttler storage + the BullMQ queue) whose sockets keep the
    // event loop alive, so the run would hang forever after writing the file —
    // fine to Ctrl-C locally, a stuck job in CI. This is a build-time tool that
    // has finished its work, so exit explicitly.
    process.exit(0);
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to generate openapi.json', error);
    process.exit(1);
  });
