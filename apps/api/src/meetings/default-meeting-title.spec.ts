import { defaultMeetingTitle } from './default-meeting-title.js';

describe('defaultMeetingTitle', () => {
  it('formats in Vietnam time, 24h, zero-padded', () => {
    // 07:30 UTC = 14:30 in Asia/Ho_Chi_Minh
    expect(defaultMeetingTitle(new Date('2026-09-17T07:30:00Z'))).toBe('Cuộc họp 17/09 14:30');
  });

  it('rolls the date over at Vietnam midnight, not UTC midnight', () => {
    expect(defaultMeetingTitle(new Date('2026-01-04T17:05:00Z'))).toBe('Cuộc họp 05/01 00:05');
  });
});
