import type { MeetingListItem } from '@meetio/shared';
import { formatMeetingMeta, initialsFromTitle } from './meeting-formatting';

function meeting(overrides: Partial<MeetingListItem> = {}): MeetingListItem {
  return {
    id: 'm1',
    title: 'Weekly Sync',
    status: 'ready',
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-15T09:05:00.000Z',
    ended_at: '2026-01-15T09:35:00.000Z',
    duration_sec: 1800,
    created_at: '2026-01-15T09:00:00.000Z',
    ...overrides,
  };
}

describe('formatMeetingMeta', () => {
  it('formats started_at and duration in minutes', () => {
    const result = formatMeetingMeta(meeting());
    expect(result).toMatch(/\d{2}:\d{2} \d{2}\/\d{2}\/2026 · 30 phút/);
  });

  it('falls back to created_at when started_at is null', () => {
    const result = formatMeetingMeta(meeting({ started_at: null }));
    expect(result).toMatch(/\d{2}:\d{2} \d{2}\/\d{2}\/2026/);
  });

  it('shows an em dash when duration is unknown', () => {
    const result = formatMeetingMeta(meeting({ duration_sec: null }));
    expect(result).toContain('—');
  });

  it('rounds sub-minute durations up to 1 phút rather than 0', () => {
    const result = formatMeetingMeta(meeting({ duration_sec: 10 }));
    expect(result).toContain('1 phút');
  });
});

describe('initialsFromTitle', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFromTitle('Weekly Sync')).toBe('WS');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initialsFromTitle('Standup')).toBe('ST');
  });

  it('returns a placeholder for a blank title', () => {
    expect(initialsFromTitle('   ')).toBe('?');
  });
});
