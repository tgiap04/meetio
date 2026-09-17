import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  User,
  RefreshToken,
  Meeting,
  TranscriptSegment,
  MeetingChunk,
  EntityRecord,
  EntityMention,
  Relation,
  EntityMergeRejection,
  ActionItem,
  QaMessage,
  ProcessingJob,
  UsageRecord,
} from './entities/index.js';
import { registerPgVectorTypes } from './data-source.js';
import { VectorRepository } from './vector.repository.js';

/**
 * Wires the TypeORM connection into Nest's DI graph. `synchronize: false`
 * always — see docs/data-model.md and phase-02-database-schema.md; the
 * HNSW indexes and the expression-based trigram index are invisible to
 * TypeORM's schema sync and it would drop them.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) {
          throw new Error('DATABASE_URL is required to connect to Postgres');
        }
        return {
          type: 'postgres' as const,
          url,
          synchronize: false,
          migrationsRun: false,
          entities: [
            User,
            RefreshToken,
            Meeting,
            TranscriptSegment,
            MeetingChunk,
            EntityRecord,
            EntityMention,
            Relation,
            EntityMergeRejection,
            ActionItem,
            QaMessage,
            ProcessingJob,
            UsageRecord,
          ],
        };
      },
      dataSourceFactory: async (options) => {
        if (!options) {
          throw new Error('TypeORM data source options were not provided');
        }
        const { DataSource } = await import('typeorm');
        const dataSource: DataSource = await new DataSource(options).initialize();
        await registerPgVectorTypes(dataSource);
        return dataSource;
      },
    }),
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      Meeting,
      TranscriptSegment,
      MeetingChunk,
      EntityRecord,
      EntityMention,
      Relation,
      EntityMergeRejection,
      ActionItem,
      QaMessage,
      ProcessingJob,
      UsageRecord,
    ]),
  ],
  providers: [VectorRepository],
  exports: [TypeOrmModule, VectorRepository],
})
export class DatabaseModule {}
