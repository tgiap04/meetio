import { clock, formatDueDate, gapNote, metaLine, NOT_READY_NOTE, type ExportDocument } from './export-document.js';

const esc = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Self-contained HTML the phone prints to PDF with expo-print (US-27). No
 * external fonts or assets — the file never fetches anything — and a system
 * font stack that carries full Vietnamese diacritics on both platforms.
 */
export function renderHtml(doc: ExportDocument): string {
  const parts: string[] = [`<h1>${esc(doc.title)}</h1>`, `<p class="meta">${esc(metaLine(doc))}</p>`];
  if (doc.sections.has('summary')) {
    parts.push('<h2>Tóm tắt</h2>');
    parts.push(doc.summaryReady && doc.summary ? `<p>${esc(doc.summary)}</p>` : `<p class="note">${NOT_READY_NOTE}</p>`);
  }
  if (doc.sections.has('actions')) {
    parts.push('<h2>Việc cần làm</h2>');
    parts.push(
      doc.actions.length === 0
        ? '<p class="note">Không có việc cần làm.</p>'
        : `<ul>${doc.actions
            .map((a) => `<li>${a.done ? '☑' : '☐'} ${esc(a.content)}${a.dueDate ? ` — hạn ${esc(formatDueDate(a.dueDate))}` : ''}</li>`)
            .join('')}</ul>`,
    );
  }
  if (doc.sections.has('transcript')) {
    parts.push('<h2>Toàn văn</h2>');
    for (const s of doc.segments) {
      if (s.gapBeforeMs) parts.push(`<p class="gap">${gapNote(s.gapBeforeMs)}</p>`);
      const translation =
        doc.sections.has('translation') && s.translatedText ? `<span class="tr">${esc(s.translatedText)}</span>` : '';
      parts.push(`<p class="seg"><span class="ts">${clock(s.startedAtMs)}</span> ${esc(s.text)}${translation}</p>`);
    }
  }
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
body{font-family:-apple-system,"Helvetica Neue",Roboto,"Noto Sans",Arial,sans-serif;color:#212F3C;margin:32px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.meta,.note,.gap{color:#5b6773}
.gap{font-style:italic;font-size:12px}.ts{color:#B75F01;font-variant-numeric:tabular-nums;margin-right:6px}
.tr{display:block;color:#5b6773;margin-left:44px}
</style></head><body>${parts.join('\n')}</body></html>`;
}
