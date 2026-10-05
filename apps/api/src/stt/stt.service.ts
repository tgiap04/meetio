import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiErrorCode, type SttLanguage, type TranscribeAudioResponse } from '@meetio/shared';
import { GeminiClient } from '../ai/gemini.client.js';
import { aiErrorToHttp } from '../ai/ai-http-error.js';
import { consentRequired, CURRENT_CONSENT_VERSION } from '../users/consent.js';

/**
 * Phase 18: transcribes one audio chunk for a phone that cannot recognise speech on-device.
 * The audio lives only in this request's memory — never written, never logged (NFR-04).
 */
@Injectable()
export class SttService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly gemini: GeminiClient,
  ) {}

  async transcribe(userId: string, audio: Buffer, mimeType: string, language: SttLanguage, meetingId?: string): Promise<TranscribeAudioResponse> {
    await this.assertConsent(userId);
    try {
      const { text } = await this.gemini.transcribeAudio({
        userId,
        audio,
        mimeType,
        language,
        meetingId: meetingId ? await this.ownMeetingId(userId, meetingId) : null,
      });
      return { text };
    } catch (error) {
      throw aiErrorToHttp(error);
    }
  }

  /** Same rule as POST /meetings: nothing reaches the AI provider before the current consent text is accepted (NFR-01). */
  async assertConsent(userId: string): Promise<void> {
    const [owner] = (await this.dataSource.query('SELECT consent_version FROM users WHERE id = $1', [userId])) as { consent_version: number | null }[];
    if (!owner || consentRequired(owner.consent_version)) {
      throw new ForbiddenException({
        code: ApiErrorCode.CONSENT_REQUIRED,
        message: 'Cần đồng ý với nội dung xử lý dữ liệu hiện hành trước khi nhận diện giọng nói',
        details: { consent_version: CURRENT_CONSENT_VERSION },
      });
    }
  }

  /** A meeting id only attributes usage; someone else's (or unknown) one is silently dropped rather than probed. */
  async ownMeetingId(userId: string, meetingId: string): Promise<string | null> {
    const rows = (await this.dataSource.query('SELECT 1 FROM meetings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [meetingId, userId])) as unknown[];
    return rows.length > 0 ? meetingId : null;
  }
}
