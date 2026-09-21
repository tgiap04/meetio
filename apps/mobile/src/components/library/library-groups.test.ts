import { LAST_WEEK_MEETING_IDS, RECENT_MEETING_IDS } from './library-groups';
import { MEETINGS } from '../../mocks';

describe('library-groups', () => {
  it('matches the design: Sprint Review and Client Discussion are "Gần đây"', () => {
    expect(RECENT_MEETING_IDS).toEqual(['sprint-review', 'client-discussion']);
  });

  it('matches the design: Project Planning and Marketing Brief are "Tuần trước"', () => {
    expect(LAST_WEEK_MEETING_IDS).toEqual(['project-planning', 'marketing-brief']);
  });

  it('is exhaustive and non-overlapping over every MEETINGS fixture id', () => {
    const recentSet = new Set(RECENT_MEETING_IDS);
    const lastWeekSet = new Set(LAST_WEEK_MEETING_IDS);
    for (const meeting of MEETINGS) {
      const inRecent = recentSet.has(meeting.id);
      const inLastWeek = lastWeekSet.has(meeting.id);
      expect(inRecent || inLastWeek).toBe(true);
      expect(inRecent && inLastWeek).toBe(false);
    }
  });
});
