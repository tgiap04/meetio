import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ApiErrorCode, EXPORT_SECTIONS, type ExportSection } from '@meetio/shared';
import { ActionItem, TranscriptSegment } from '../database/entities/index.js';
import { ActionStatus } from '../database/enums/action-status.enum.js';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { MeetingsRepository } from '../meetings/meetings.repository.js';
import { renderMarkdown, type ExportDocument } from './export-document.js';
import { renderHtml } from './render-html.js';

export interface RenderedExport {
  body: string;
  contentType: string;
  filename: string;
}

export function parseSections(include: string | undefined): ReadonlySet<ExportSection> {
  if (!include) return new Set(EXPORT_SECTIONS);
  const requested = include.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((s) => !(EXPORT_SECTIONS as readonly string[]).includes(s));
  if (unknown.length > 0 || requested.length === 0) {
    throw new BadRequestException({
      code: ApiErrorCode.VALIDATION_ERROR,
      message: `include chỉ nhận: ${EXPORT_SECTIONS.join(', ')}`,
      details: { include: unknown },
    });
  }
  return new Set(requested as ExportSection[]);
}

/** ASCII file name from a Vietnamese title: "Họp dự án Đà Nẵng" → "hop-du-an-da-nang". */
export function exportFileStem(title: string): string {
  const stem = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || 'bien-ban';
}

/**
 * `GET /meetings/:id/export` (US-27). Builds the document on the server and
 * hands it back in the response — nothing is stored or uploaded; the phone
 * shares it through the OS share sheet (and prints `html` to PDF itself).
 * A meeting the pipeline has not finished still exports its transcript, with a
 * note in place of the summary.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly meetings: MeetingsRepository,
    @InjectRepository(ActionItem) private readonly actionItems: Repository<ActionItem>,
    @InjectRepository(TranscriptSegment) private readonly segments: Repository<TranscriptSegment>,
  ) {}

  async render(meetingId: string, userId: string, format: 'markdown' | 'html', include?: string): Promise<RenderedExport> {
    const sections = parseSections(include);
    const meeting = await this.meetings.findOneOrFail(meetingId, userId);
    const [actions, segments] = await Promise.all([
      sections.has('actions') ? this.actionItems.find({ where: { meeting_id: meetingId }, order: { created_at: 'ASC' } }) : [],
      sections.has('transcript') ? this.segments.find({ where: { meeting_id: meetingId }, order: { seq: 'ASC' } }) : [],
    ]);
    const doc: ExportDocument = {
      title: meeting.title,
      startedAt: meeting.started_at,
      durationSec: meeting.duration_sec,
      summaryReady: meeting.status === MeetingStatus.READY,
      summary: meeting.summary,
      actions: actions.map((a) => ({ content: a.content, dueDate: a.due_date, done: a.status === ActionStatus.DONE })),
      segments: segments.map((s) => ({
        startedAtMs: s.started_at_ms,
        text: s.text,
        translatedText: s.translated_text,
        gapBeforeMs: s.gap_before_ms,
      })),
      sections,
    };
    const stem = exportFileStem(meeting.title);
    return format === 'markdown'
      ? { body: renderMarkdown(doc), contentType: 'text/markdown; charset=utf-8', filename: `${stem}.md` }
      : { body: renderHtml(doc), contentType: 'text/html; charset=utf-8', filename: `${stem}.html` };
  }
}
