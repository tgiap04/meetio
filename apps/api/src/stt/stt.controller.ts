import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STT_MAX_AUDIO_BYTES, type TranscribeAudioResponse } from '@meetio/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UserThrottlerGuard } from '../common/throttler/user-throttler.guard.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.type.js';
import { TranscribeAudioDto } from './dto/transcribe.dto.js';
import { PayloadTooLargeFilter } from './payload-too-large.filter.js';
import { acceptedAudioMime, type UploadedAudio } from './stt-audio.js';
import { SttService } from './stt.service.js';

/** One chunk every ~10s while recording, plus headroom for retries (phase-18). */
const TRANSCRIBE_LIMIT = { default: { limit: 12, ttl: 60_000 } };

/** api-spec §7 — server-side speech recognition for phones without an on-device recognizer. */
@ApiTags('stt')
@ApiBearerAuth()
@Controller('stt')
@UseGuards(UserThrottlerGuard)
export class SttController {
  constructor(private readonly stt: SttService) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @Throttle(TRANSCRIBE_LIMIT)
  // No `storage`/`dest` option → multer keeps the upload in memory; nothing is ever written to disk.
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: STT_MAX_AUDIO_BYTES, files: 1 } }))
  @UseFilters(PayloadTooLargeFilter)
  @ApiOperation({ summary: 'Transcribe one short audio chunk with Gemini; the audio is not stored' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio', 'language'],
      properties: {
        audio: { type: 'string', format: 'binary', description: 'AAC/m4a chunk, at most 1 MB' },
        language: { type: 'string', enum: ['vi-VN', 'en-US'] },
        meeting_id: { type: 'string', format: 'uuid' },
      },
    },
  })
  transcribe(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedAudio | undefined, @Body() dto: TranscribeAudioDto): Promise<TranscribeAudioResponse> {
    if (!file || file.buffer.length === 0) throw new BadRequestException('Thiếu tệp âm thanh (trường audio)');
    const mime = acceptedAudioMime(file.mimetype);
    if (!mime) throw new BadRequestException('Định dạng âm thanh không được hỗ trợ');
    return this.stt.transcribe(user.userId, file.buffer, mime, dto.language, dto.meeting_id);
  }
}
