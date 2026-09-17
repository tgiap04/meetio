import 'reflect-metadata';
// Loads the workspace .env before anything reads process.env — see load-env.ts.
// ConfigModule resolves its envFilePath against the CWD, which is apps/api under
// `nest start`, where no .env exists.
import './load-env.js';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { SWAGGER_PATH, setupSwagger } from './swagger.js';
import { buildStartupUrls } from './startup-urls.js';

const GLOBAL_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());

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
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap', error);
  process.exit(1);
});
