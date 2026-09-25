import type { ExportSection } from '@meetio/shared';

/** Everything an export can contain, already read and ordered. Pure data — rendering is below. */
export interface ExportDocument {
  title: string;
  startedAt: Date | null;
  durationSec: number | null;
  summaryReady: boolean;
  summary: string | null;
  actions: { content: string; dueDate: string | null; done: boolean }[];
  segments: { startedAtMs: number; text: string; translatedText: string | null; gapBeforeMs: number | null }[];
  sections: ReadonlySet<ExportSection>;
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "17/09/2026 14:30", Vietnam time — explicit parts, not a locale's short style that drops the zero padding. */
export function formatDateTime(d: Date): string {
  const p = Object.fromEntries(DATE.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** `due_date` is a DATE column ("2026-09-20"); show it as "20/09/2026". */
export function formatDueDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export function metaLine(doc: ExportDocument): string {
  const parts = [];
  if (doc.startedAt) parts.push(formatDateTime(doc.startedAt));
  if (doc.durationSec !== null) parts.push(`${Math.round(doc.durationSec / 60)} phút`);
  return parts.join(' · ');
}

export const NOT_READY_NOTE = 'Tóm tắt chưa sẵn sàng — cuộc họp chưa được AI xử lý xong.';
export const gapNote = (ms: number) => `(gián đoạn ${Math.round(ms / 1000)} giây)`;

/** Markdown export (US-27). Transcript text is escaped so a spoken "#" or "*" stays literal. */
export function renderMarkdown(doc: ExportDocument): string {
  // Inline markers anywhere; block markers (#, >, -, +, "1.") only where they start a line.
  const esc = (t: string) =>
    t
      .replace(/([\\`*_[\]|])/g, '\\$1')
      .replace(/^(\s*)([#>+-]|\d+\.)/gm, '$1\\$2');
  const out = [`# ${esc(doc.title)}`, '', metaLine(doc), ''];
  if (doc.sections.has('summary')) {
    out.push('## Tóm tắt', '', doc.summaryReady && doc.summary ? esc(doc.summary) : `_${NOT_READY_NOTE}_`, '');
  }
  if (doc.sections.has('actions')) {
    out.push('## Việc cần làm', '');
    if (doc.actions.length === 0) out.push('_Không có việc cần làm._');
    for (const a of doc.actions) out.push(`- [${a.done ? 'x' : ' '}] ${esc(a.content)}${a.dueDate ? ` — hạn ${formatDueDate(a.dueDate)}` : ''}`);
    out.push('');
  }
  if (doc.sections.has('transcript')) {
    out.push('## Toàn văn', '');
    for (const s of doc.segments) {
      if (s.gapBeforeMs) out.push(`_${gapNote(s.gapBeforeMs)}_`, '');
      out.push(`**[${clock(s.startedAtMs)}]** ${esc(s.text)}`);
      if (doc.sections.has('translation') && s.translatedText) out.push(`> ${esc(s.translatedText)}`);
      out.push('');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}
