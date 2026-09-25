import type { MeetingActionItem } from '@meetio/shared';
import { toActionItem, toMeetingSummary } from './meeting-detail-mappers';

describe('toMeetingSummary', () => {
  it('carries the real summary through', () => {
    expect(toMeetingSummary('m1', 'Nội dung tóm tắt')).toEqual({
      meetingId: 'm1',
      paragraph: 'Nội dung tóm tắt',
    });
  });

  it('falls back to a placeholder when summary is null', () => {
    expect(toMeetingSummary('m1', null).paragraph).toBe('Chưa có bản tóm tắt cho cuộc họp này.');
  });
});

describe('toActionItem', () => {
  function item(overrides: Partial<MeetingActionItem> = {}): MeetingActionItem {
    return {
      id: 'a1',
      content: 'Gửi báo cáo',
      assignee_entity_id: null,
      due_date: null,
      status: 'open',
      is_manual: false,
      ...overrides,
    };
  }

  it('maps content to title and formats the due date as DD/MM', () => {
    const result = toActionItem(item({ due_date: '2026-03-05T00:00:00.000Z' }));
    expect(result.title).toBe('Gửi báo cáo');
    expect(result.due).toBe('05/03');
  });

  it('falls back to placeholders when assignee/due are null', () => {
    const result = toActionItem(item());
    expect(result.assignee).toBe('Chưa có người phụ trách');
    expect(result.due).toBe('Chưa có hạn');
  });

  it('uses the assignee entity id verbatim when present', () => {
    const result = toActionItem(item({ assignee_entity_id: 'entity-42' }));
    expect(result.assignee).toBe('entity-42');
  });
});
