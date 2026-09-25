import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { TranscriptModule } from './transcript/transcript.module.js';
import { ExportModule } from './export/export.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PipelineModule } from './pipeline/pipeline.module.js';
import { AiModule } from './ai/ai.module.js';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // api-spec §10: 300/min/user is the default for everything not named a
    // more specific limit; `AuthController` overrides it to 10/min/IP with
    // `@Throttle`. Backed by Redis so the count is shared across processes.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL is required for rate limiting');
        }
        return {
          throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
          storage: new RedisThrottlerStorage(redisUrl),
        };
      },
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    JobsModule,
    MeetingsModule,
    RealtimeModule,
    TranscriptModule,
    ExportModule,
    NotificationsModule,
    PipelineModule,
    AiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
