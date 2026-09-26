import { parseSummary, SummarySchemaError, validDate } from './summary-schema.js';
import { summarySystemInstruction, withWeekday } from './summary-prompt.js';

const answer = (o: Record<string, unknown>) => JSON.stringify({ insufficient: false, summary_points: [], decisions: [], action_items: [], ...o });

describe('parseSummary', () => {
  it('keeps cited lines and tasks, mapping only labels that were sent', () => {
    const out = parseSummary(
      answer({
        summary_points: [{ text: 'Ngân sách tăng 10%', sources: ['C1', 'C9', 'C1'] }],
        decisions: [{ text: 'Chốt ra mắt tháng 11', sources: ['C2'] }],
        action_items: [{ content: 'Gửi báo cáo lỗi', assignee: 'Tuấn', due_date: '2026-10-02', source: 'C2' }],
      }),
      ['C1', 'C2'],
    );
    expect(out.points).toEqual([{ text: 'Ngân sách tăng 10%', labels: ['C1'] }]);
    expect(out.decisions).toEqual([{ text: 'Chốt ra mắt tháng 11', labels: ['C2'] }]);
    expect(out.actions).toEqual([{ content: 'Gửi báo cáo lỗi', assignee: 'Tuấn', due_date: '2026-10-02', label: 'C2' }]);
  });

  it('drops lines and tasks it cannot trace back, instead of keeping invented content', () => {
    const out = parseSummary(
      answer({
        summary_points: [{ text: 'Có nguồn', sources: ['C1'] }, { text: 'Không nguồn', sources: [] }, { text: 'Nguồn lạ', sources: ['C7'] }],
        action_items: [{ content: 'Việc lạ', source: 'C5' }],
      }),
      ['C1'],
    );
    expect(out.points.map((p) => p.text)).toEqual(['Có nguồn']);
    expect(out.actions).toEqual([]);
  });

  it('turns a missing or vague assignee and deadline into null — never a guess', () => {
    const out = parseSummary(
      answer({
        action_items: [
          { content: 'A', assignee: null, due_date: 'thứ Sáu', source: 'C1' },
          { content: 'B', assignee: '   ', due_date: '2026-02-30', source: 'C1' },
        ],
      }),
      ['C1'],
    );
    expect(out.actions.map((a) => [a.assignee, a.due_date])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it.each([
    ['not JSON', 'Đây là tóm tắt:'],
    ['no insufficient flag', JSON.stringify({ summary_points: [], decisions: [], action_items: [] })],
    ['point without sources array', answer({ summary_points: [{ text: 'x', sources: 'C1' }] })],
    ['non-string content', answer({ action_items: [{ content: 3, source: 'C1' }] })],
  ])('rejects a structurally wrong answer (%s) so the caller retries', (_c, raw) => {
    expect(() => parseSummary(raw, ['C1'])).toThrow(SummarySchemaError);
  });
});

describe('validDate', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(validDate('2026-10-02')).toBe('2026-10-02');
    expect(validDate('2026-13-01')).toBeNull();
    expect(validDate('02/10/2026')).toBeNull();
    expect(validDate(null)).toBeNull();
  });
});

describe('summary prompt', () => {
  it('tells the model which weekday the meeting was on, so "thứ Sáu" resolves to the next Friday', () => {
    expect(withWeekday('2026-09-26')).toBe('2026-09-26 (Thứ Bảy / Saturday)');
    expect(summarySystemInstruction('vi-VN', '2026-09-26')).toContain('2026-09-26 (Thứ Bảy / Saturday)');
    expect(summarySystemInstruction('vi-VN', '2026-09-26')).toContain('tiếng Việt');
  });
});
