import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ApiErrorCode } from '@meetio/shared';
import { TranscriptSegment } from '../database/entities/index.js';
import { OwnershipViolationException } from '../common/exceptions/ownership-violation.exception.js';
import { MeetingsRepository } from './meetings.repository.js';

/** Stores the translation the phone produced on-device. The text is user content: never logged. */
@Injectable()
export class SegmentTranslationService {
  constructor(
    private readonly meetings: MeetingsRepository,
    @InjectRepository(TranscriptSegment) private readonly segments: Repository<TranscriptSegment>,
  ) {}

  async put(meetingId: string, userId: string, seq: number, translatedText: string, translatedTo: string): Promise<void> {
    const meeting = await this.meetings.findOneOrFail(meetingId, userId);
    if (meeting.translate_to === null || meeting.translate_to !== translatedTo) {
      const reason = meeting.translate_to === null ? 'Cuộc họp này không bật dịch' : 'Ngôn ngữ dịch không khớp với cuộc họp';
      throw new BadRequestException({ code: ApiErrorCode.VALIDATION_ERROR, message: reason, details: { translated_to: reason } });
    }
    const result = await this.segments.update(
      { meeting_id: meetingId, seq },
      { translated_text: translatedText, translated_to: translatedTo },
    );
    if (!result.affected) {
      // Not ingested yet: the client keeps the translation and retries after the segment arrives.
      throw new OwnershipViolationException(ApiErrorCode.NOT_FOUND, 'Không tìm thấy đoạn transcript');
    }
  }
}
