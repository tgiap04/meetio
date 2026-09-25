import { EXPORT_SECTIONS } from '@meetio/shared';
import { renderMarkdown, type ExportDocument } from './export-document.js';
import { renderHtml } from './render-html.js';
import { exportFileStem, parseSections } from './export.service.js';

const doc = (over: Partial<ExportDocument> = {}): ExportDocument => ({
  title: 'Họp sprint 12',
  startedAt: new Date('2026-09-17T07:30:00Z'),
  durationSec: 3600,
  summaryReady: true,
  summary: 'Chốt phạm vi sprint.',
  actions: [{ content: 'Gửi báo cáo', dueDate: '2026-09-20', done: false }],
  segments: [
    { startedAtMs: 4000, text: 'Chào mọi người', translatedText: 'Hello everyone', gapBeforeMs: null },
    { startedAtMs: 3_725_000, text: '# không phải tiêu đề *nhé*', translatedText: null, gapBeforeMs: 3000 },
  ],
  sections: new Set(EXPORT_SECTIONS),
  ...over,
});

describe('markdown export', () => {
  it('contains title, meta, summary, actions and the timed transcript with translations', () => {
    const md = renderMarkdown(doc());
    expect(md).toContain('# Họp sprint 12');
    expect(md).toContain('17/09/2026 14:30');
    expect(md).toContain('60 phút');
    expect(md).toContain('## Tóm tắt\n\nChốt phạm vi sprint.');
    expect(md).toContain('- [ ] Gửi báo cáo — hạn 20/09/2026');
    expect(md).toContain('**[00:04]** Chào mọi người');
    expect(md).toContain('> Hello everyone');
    expect(md).toContain('**[1:02:05]**');
  });

  it('keeps spoken markdown characters literal and marks restart gaps', () => {
    const md = renderMarkdown(doc());
    expect(md).toContain('\\# không phải tiêu đề \\*nhé\\*');
    expect(md).toContain('_(gián đoạn 3 giây)_');
  });

  it('does not escape an ordinary hyphen inside a sentence', () => {
    const md = renderMarkdown(doc({ segments: [{ startedAtMs: 0, text: 'thứ-hai', translatedText: null, gapBeforeMs: null }] }));
    expect(md).toContain('thứ-hai');
  });

  it('notes a summary that is not ready instead of leaving it blank (US-27)', () => {
    const md = renderMarkdown(doc({ summaryReady: false, summary: null }));
    expect(md).toContain('Tóm tắt chưa sẵn sàng');
  });

  it('includes only the chosen sections; translation needs transcript', () => {
    const md = renderMarkdown(doc({ sections: new Set(['transcript']) }));
    expect(md).not.toContain('## Tóm tắt');
    expect(md).not.toContain('## Việc cần làm');
    expect(md).not.toContain('Hello everyone');
  });
});

describe('html export', () => {
  it('escapes transcript text and loads nothing external', () => {
    const html = renderHtml(doc({ segments: [{ startedAtMs: 0, text: '<script>alert(1)</script>', translatedText: null, gapBeforeMs: null }] }));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<link|src=|url\(/);
    expect(html).toContain('<html lang="vi">');
  });
});

describe('export helpers', () => {
  it('builds an ASCII file name from a Vietnamese title', () => {
    expect(exportFileStem('Họp dự án Đà Nẵng — Q4!')).toBe('hop-du-an-da-nang-q4');
    expect(exportFileStem('???')).toBe('bien-ban');
  });

  it('parses include, defaulting to every section and rejecting unknown ones', () => {
    expect([...parseSections(undefined)].sort()).toEqual([...EXPORT_SECTIONS].sort());
    expect([...parseSections('summary, transcript')]).toEqual(['summary', 'transcript']);
    expect(() => parseSections('summary,secrets')).toThrow();
  });
});
