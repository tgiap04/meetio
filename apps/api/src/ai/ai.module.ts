import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
import { GeminiClient, type GenAiModels } from './gemini.client.js';
import { GeminiCallRunner } from './gemini-call-runner.js';
import { GeminiKeyPool, parseApiKeys } from './gemini-key-pool.js';
import { UsageTracker } from './usage-tracker.js';

const num = (raw: string | undefined, fallback: number) => (Number(raw) > 0 ? Number(raw) : fallback);

/**
 * Gemini lives only on the backend (phase-11 "Bảo mật"). A missing key never
 * blocks boot — the client reports itself unconfigured and each call fails
 * with AI_SERVICE_UNAVAILABLE, which the pipeline treats as retryable.
 */
@Module({
  providers: [
    { provide: UsageTracker, inject: [DataSource], useFactory: (ds: DataSource) => new UsageTracker(ds) },
    {
      provide: GeminiClient,
      inject: [ConfigService, UsageTracker],
      useFactory: (config: ConfigService, usage: UsageTracker) => {
        const logger = new Logger('GeminiClient');
        // Several keys, comma-separated, used in turn (clarifications 2026-09-26). Only the count is logged.
        const keys = parseApiKeys(config.get<string>('GEMINI_API_KEY'));
        const baseUrl = config.get<string>('GEMINI_BASE_URL') || undefined;
        if (keys.length === 0) logger.warn('GEMINI_API_KEY is empty — AI steps will fail until it is set');
        else logger.log(`Gemini key pool: ${keys.length} key(s)`);
        const runner =
          keys.length === 0
            ? null
            : new GeminiCallRunner<GenAiModels>(
                new GeminiKeyPool(
                  keys.map(
                    (apiKey) =>
                      // GEMINI_BASE_URL: a proxy, or the e2e suite's local fake Gemini.
                      new GoogleGenAI({ apiKey, httpOptions: baseUrl ? { baseUrl } : undefined }).models as unknown as GenAiModels,
                  ),
                  { defaultCooldownMs: num(config.get<string>('GEMINI_KEY_COOLDOWN_MS'), 60_000) },
                ),
                {
                  maxConcurrency: num(config.get<string>('GEMINI_MAX_CONCURRENCY'), 4),
                  // 5 retries ≈ 1+2+4+8+16 s: rides out a model-wide 503 spike before the pipeline's own step retry.
                  retries: num(config.get<string>('GEMINI_MAX_RETRIES'), 5),
                  retryBaseMs: 1000,
                  log: (m) => logger.warn(m),
                },
              );
        return new GeminiClient(runner, usage, {
          // gemini-flash-latest answered 503 "high demand" on every full live run (2026-09-26); 2.5-flash met the NFR.
          textModel: config.get<string>('GEMINI_TEXT_MODEL') || 'gemini-2.5-flash',
          embeddingModel: config.get<string>('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-001',
          dimensions: 768,
        });
      },
    },
  ],
  exports: [GeminiClient, UsageTracker],
})
export class AiModule {}
