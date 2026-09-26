import 'reflect-metadata';
// Loads the workspace .env before anything reads process.env — see load-env.ts.
// ConfigModule resolves its envFilePath against the CWD, which is apps/api under
// `nest start`, where no .env exists.
import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { JsonLogger, useJsonLogs } from './common/logging/json-logger.js';
import { configureApp, GLOBAL_PREFIX } from './configure-app.js';
import { SWAGGER_PATH, setupSwagger } from './swagger.js';
import { buildStartupUrls } from './startup-urls.js';
import { GoogleTokenVerifier } from './auth/google-token-verifier.js';

async function bootstrap(): Promise<void> {
  // NFR-04/11: one JSON object per line in production (LOG_FORMAT=json), readable text in dev.
  const app = await NestFactory.create(AppModule, useJsonLogs() ? { logger: new JsonLogger() } : {});
  const logger = new Logger('Bootstrap');

  configureApp(app);

  const swaggerDocument = setupSwagger(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  // Only after listen() does the bound address exist, so the URLs are read from
  // the server rather than reassembled from PORT — they stay correct if the port
  // is taken from the environment or assigned by the OS.
  const { api, docs } = buildStartupUrls(
    await app.getUrl(),
    GLOBAL_PREFIX,
    swaggerDocument ? SWAGGER_PATH : null,
  );

  logger.log(`API     ${api}`);
  // State the Swagger outcome either way: "are the docs exposed on this box?" is
  // a question ops should answer from the boot log, not by probing the URL.
  if (docs) {
    logger.log(`Swagger ${docs}`);
  } else {
    logger.log('Swagger disabled (set SWAGGER_ENABLED=true to serve the docs)');
  }

  // Reads the same instance the app actually routes requests through, so this
  // line can never drift from what POST /auth/google will really do
  // (decisions.md §7 — missing config logs a warning, it never blocks boot).
  const googleVerifier = app.get(GoogleTokenVerifier);
  if (googleVerifier.isConfigured()) {
    logger.log('Google sign-in ENABLED');
  } else {
    logger.warn('Google sign-in DISABLED (GOOGLE_OAUTH_AUDIENCES is empty)');
  }
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
