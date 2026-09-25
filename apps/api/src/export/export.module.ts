import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItem, TranscriptSegment } from '../database/entities/index.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ActionItem, TranscriptSegment]), MeetingsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
