/**
 * Explicit section membership for the Library screen's two date-grouped
 * sections — "Gần đây" (Sprint Review, Client Discussion) and "Tuần trước"
 * (Project Planning, Marketing Brief), per `screen-12-thu-vien.png` and
 * phase-10's Key Insight 3.
 *
 * Deliberately NOT computed from `Meeting.date` against `Date.now()`: that
 * would make the screen's content drift with the calendar and the tests
 * flaky. `meetings.mock.ts` (P02, out of this phase's ownership) shipped
 * with no `group` field of its own, so the mapping lives here instead,
 * scoped to this phase's `src/components/library/**` glob.
 */
export type LibraryGroupId = 'recent' | 'lastWeek';

export const RECENT_MEETING_IDS: readonly string[] = ['sprint-review', 'client-discussion'];
export const LAST_WEEK_MEETING_IDS: readonly string[] = ['project-planning', 'marketing-brief'];
