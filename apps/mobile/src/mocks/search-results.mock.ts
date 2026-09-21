/**
 * Three result groups for the search screen, transcribed from
 * `design/screen-13-tim-kiem.png`.
 *
 * The crop's "Cuộc họp" heading reads "(3)" but draws only 2 rows. This
 * fixture holds all 3 meetings so the screen can derive the heading count
 * from `items.length` and the two can never disagree — see `plan.md`
 * conflict 5. The unseen third meeting is a judgement call: `Project
 * Planning`, already part of the `MEETINGS` set, filled in as
 * `// INFERRED:` below since the crop does not draw its row or snippet.
 */
import type { DocumentSearchGroup, MeetingSearchGroup, PersonSearchGroup, SearchGroup } from './types';

// Resolved at 12x from design/screen-13-tim-kiem.png, crop 110x16+1218+576.
export const SEARCH_FIELD_PLACEHOLDER = 'Tìm theo từ khóa, người, dự án...';

const MEETING_GROUP: MeetingSearchGroup = {
  id: 'group-meetings',
  label: 'Cuộc họp',
  kind: 'meeting',
  items: [
    {
      kind: 'meeting',
      id: 'sprint-review',
      title: 'Sprint Review',
      durationMinutes: 42,
      date: '12/05/2025',
      status: 'done',
      snippet: '...authentication và API...',
    },
    {
      kind: 'meeting',
      id: 'client-discussion',
      title: 'Client Discussion',
      durationMinutes: 28,
      date: '10/05/2025',
      status: 'done',
      snippet: '...triển khai API...',
    },
    {
      // INFERRED: the crop's "Cuộc họp (3)" heading implies a third row this
      // crop does not draw. `Project Planning` is chosen because it is
      // already part of `MEETINGS` and its transcript discusses the same
      // API/authentication topic as the other two matches.
      kind: 'meeting',
      id: 'project-planning',
      title: 'Project Planning',
      durationMinutes: 51,
      date: '08/05/2025',
      status: 'processing',
      snippet: '...kế hoạch API và authentication...',
    },
  ],
} as const satisfies MeetingSearchGroup;

const DOCUMENT_GROUP: DocumentSearchGroup = {
  id: 'group-documents',
  label: 'Tài liệu',
  kind: 'document',
  items: [
    {
      kind: 'document',
      id: 'api-documentation',
      title: 'API Documentation',
      status: 'processing',
      relatedTo: 'Dự án ABC - API',
    },
    {
      kind: 'document',
      id: 'meeting-summary',
      title: 'Meeting Summary',
      status: 'done',
      relatedTo: 'Authentication',
    },
  ],
} as const satisfies DocumentSearchGroup;

const PERSON_GROUP: PersonSearchGroup = {
  id: 'group-people',
  label: 'Người',
  kind: 'person',
  items: [
    {
      kind: 'person',
      id: 'nguyen-van-anh',
      name: 'Nguyễn Văn Anh',
      initials: 'NA',
      meetingCount: 2,
    },
  ],
} as const satisfies PersonSearchGroup;

export const SEARCH_GROUPS: readonly SearchGroup[] = [MEETING_GROUP, DOCUMENT_GROUP, PERSON_GROUP] as const;
