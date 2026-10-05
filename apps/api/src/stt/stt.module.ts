import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SttController } from './stt.controller.js';
import { SttService } from './stt.service.js';
import { SttStreamGateway } from './stt-stream.gateway.js';
import { STT_STREAM_OPTIONS, SttStreamService } from './stt-stream.service.js';
import type { SttStreamOptions } from './stt-stream.js';

const num = (raw: string | undefined, fallback: number) => (Number(raw) > 0 ? Number(raw) : fallback);

/**
 * Phase 18 chunked Gemini speech-to-text + Phase 19 streaming over Gemini Live (docs/system-architecture.md).
 * The STT_LIVE_* variables exist for the tests; production runs on the defaults.
 */
@Module({
  imports: [AiModule, AuthModule],
  controllers: [SttController],
  providers: [
    SttService,
    SttStreamService,
    SttStreamGateway,
    {
      provide: STT_STREAM_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SttStreamOptions => ({
        // Gemini ends a Live session at 10 minutes: rotate at 9, from 8:30 at the first pause.
        rotateAfterMs: num(config.get<string>('STT_LIVE_ROTATE_MS'), 540_000),
        quietWindowMs: num(config.get<string>('STT_LIVE_QUIET_WINDOW_MS'), 30_000),
        overlapMs: num(config.get<string>('STT_LIVE_OVERLAP_MS'), 2500),
        flushMs: num(config.get<string>('STT_LIVE_FLUSH_MS'), 2000),
        ringMs: 3000,
        maxStartsPerMinute: num(config.get<string>('STT_LIVE_MAX_STARTS_PER_MIN'), 5),
        maxConcurrent: Number(config.get<string>('STT_LIVE_MAX_CONCURRENT')) > 0 ? Number(config.get<string>('STT_LIVE_MAX_CONCURRENT')) : 0,
        usageIntervalMs: num(config.get<string>('STT_LIVE_USAGE_INTERVAL_MS'), 60_000),
      }),
    },
  ],
})
export class SttModule {}
