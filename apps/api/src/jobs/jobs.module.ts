import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { User, Meeting } from '../database/entities/index.js';
import { AccountMaintenanceService } from './account-deletion.job.js';
import { AccountMaintenanceProcessor, ACCOUNT_MAINTENANCE_QUEUE } from './account-maintenance.processor.js';
import { AccountMaintenanceScheduler } from './account-maintenance.scheduler.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { MeetingMaintenanceService } from './abandoned-meeting.job.js';
import { MeetingMaintenanceProcessor, MEETING_MAINTENANCE_QUEUE } from './meeting-maintenance.processor.js';
import { MeetingMaintenanceScheduler } from './meeting-maintenance.scheduler.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Meeting]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          throw new Error('REDIS_URL is required for the account-maintenance queue');
        }
        // BULLMQ_PREFIX isolates a process's queues from others on the same Redis —
        // the e2e suites use it so a developer's running `make dev` server cannot
        // steal their jobs. Unset = BullMQ's default prefix.
        return { connection: new Redis(url, { maxRetriesPerRequest: null }), prefix: config.get<string>('BULLMQ_PREFIX') || undefined };
      },
    }),
    BullModule.registerQueue({ name: ACCOUNT_MAINTENANCE_QUEUE }, { name: MEETING_MAINTENANCE_QUEUE }),
    MeetingsModule,
    PipelineModule,
  ],
  providers: [
    AccountMaintenanceService,
    AccountMaintenanceProcessor,
    AccountMaintenanceScheduler,
    MeetingMaintenanceService,
    MeetingMaintenanceProcessor,
    MeetingMaintenanceScheduler,
  ],
  exports: [AccountMaintenanceService],
})
export class JobsModule {}
