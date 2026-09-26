import { renderMarkdown, summaryBlocks, type ExportDocument } from './export-document.js';
import { renderHtml } from './render-html.js';

const SUMMARY = '• Ngân sách tăng 10%\n• Ra mắt tháng 11 <beta>\n\nQuyết định:\n• Chuyển sang Google Cloud';
const doc = (summary: string | null, summaryReady = true): ExportDocument => ({
  title: 'Họp',
  startedAt: null,
  durationSec: null,
  summaryReady,
  summary,
  actions: [],
  segments: [],
  sections: new Set(['summary']),
});

describe('summary in exports', () => {
  it('reads the stored bullet text back into lists and paragraphs', () => {
    expect(summaryBlocks(SUMMARY)).toEqual([
      { kind: 'list', items: ['Ngân sách tăng 10%', 'Ra mắt tháng 11 <beta>'] },
      { kind: 'text', text: 'Quyết định:' },
      { kind: 'list', items: ['Chuyển sang Google Cloud'] },
    ]);
  });

  it('keeps every point on its own line in HTML (and escaped), instead of one run-on paragraph', () => {
    const html = renderHtml(doc(SUMMARY));
    expect(html).toContain('<ul><li>Ngân sách tăng 10%</li><li>Ra mắt tháng 11 &lt;beta&gt;</li></ul><p>Quyết định:</p><ul><li>Chuyển sang Google Cloud</li></ul>');
  });

  it('writes a real Markdown list, not soft-wrapped "•" lines', () => {
    const md = renderMarkdown(doc(SUMMARY));
    expect(md).toContain('## Tóm tắt\n\n- Ngân sách tăng 10%\n- Ra mắt tháng 11 <beta>\n\nQuyết định:\n\n- Chuyển sang Google Cloud\n');
  });

  it('renders the insufficiency sentence as a plain paragraph', () => {
    const sentence = 'Cuộc họp quá ngắn hoặc không có đủ nội dung để tóm tắt.';
    expect(renderHtml(doc(sentence))).toContain(`<p>${sentence}</p>`);
    expect(renderMarkdown(doc(sentence))).toContain(`## Tóm tắt\n\n${sentence}\n`);
  });
});
