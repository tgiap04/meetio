import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
import { GeminiClient } from './gemini.client.js';
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
        const apiKey = config.get<string>('GEMINI_API_KEY');
        if (!apiKey) new Logger('GeminiClient').warn('GEMINI_API_KEY is empty — AI steps will fail until it is set');
        return new GeminiClient(apiKey ? new GoogleGenAI({ apiKey }).models : null, usage, {
          model: config.get<string>('GEMINI_TEXT_MODEL') || 'gemini-flash-latest',
          maxConcurrency: num(config.get<string>('GEMINI_MAX_CONCURRENCY'), 4),
          retries: 2,
          retryBaseMs: 1000,
        });
      },
    },
  ],
  exports: [GeminiClient, UsageTracker],
})
export class AiModule {}
