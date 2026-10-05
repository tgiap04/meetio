import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export interface TranslationTarget {
  userId: string;
  sourceLanguage: string;
  /** Null: translation is off for this meeting. */
  translateTo: string | null;
}

export interface StoredSegment {
  text: string;
  translatedText: string | null;
  translatedTo: string | null;
}

/** The few reads and the one write translation needs; raw SQL keeps it independent of the meetings/transcript modules. */
@Injectable()
export class TranslationStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The meeting's translation settings; null when it does not exist, is deleted, or (with `userId`) belongs to someone else. */
  async targetFor(meetingId: string, userId?: string): Promise<TranslationTarget | null> {
    const rows = (await this.dataSource.query(
      `SELECT user_id, source_language, translate_to FROM meetings
       WHERE id = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR user_id = $2)`,
      [meetingId, userId ?? null],
    )) as { user_id: string; source_language: string; translate_to: string | null }[];
    const row = rows[0];
    return row ? { userId: row.user_id, sourceLanguage: row.source_language, translateTo: row.translate_to } : null;
  }

  /** Of `seqs`, the segments that exist and still have no translation, with their stored text. */
  async untranslated(meetingId: string, seqs: readonly number[]): Promise<{ seq: number; text: string }[]> {
    if (seqs.length === 0) return [];
    return (await this.dataSource.query(
      `SELECT seq, text FROM transcript_segments
       WHERE meeting_id = $1 AND seq = ANY($2::int[]) AND translated_text IS NULL ORDER BY seq`,
      [meetingId, [...seqs]],
    )) as { seq: number; text: string }[];
  }

  async segment(meetingId: string, seq: number): Promise<StoredSegment | null> {
    const rows = (await this.dataSource.query(
      'SELECT text, translated_text, translated_to FROM transcript_segments WHERE meeting_id = $1 AND seq = $2',
      [meetingId, seq],
    )) as { text: string; translated_text: string | null; translated_to: string | null }[];
    const row = rows[0];
    return row ? { text: row.text, translatedText: row.translated_text, translatedTo: row.translated_to } : null;
  }

  /**
   * Stores a translation only into a still-untranslated row (or one translated for another language), and only while the
   * meeting still wants `target` — so a late answer never overwrites a newer
   * one or lands after translation was switched off or to another language.
   * Returns whether this call wrote it.
   */
  async saveTranslation(meetingId: string, seq: number, text: string, target: string): Promise<boolean> {
    // TypeORM's postgres driver answers an UPDATE as [rows, affectedCount].
    const [, affected] = (await this.dataSource.query(
      `UPDATE transcript_segments s SET translated_text = $3, translated_to = $4
       WHERE s.meeting_id = $1 AND s.seq = $2 AND (s.translated_text IS NULL OR s.translated_to IS DISTINCT FROM $4)
         AND EXISTS (SELECT 1 FROM meetings m WHERE m.id = s.meeting_id AND m.translate_to = $4 AND m.deleted_at IS NULL)
       RETURNING s.seq`,
      [meetingId, seq, text, target],
    )) as [unknown[], number];
    return affected > 0;
  }
}
