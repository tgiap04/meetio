import type { MeetingActionItem } from '@meetio/shared';
import type { ActionItem, MeetingSummary } from '../mocks/types';

const NO_SUMMARY_FALLBACK = 'Chưa có bản tóm tắt cho cuộc họp này.';
const NO_ASSIGNEE_FALLBACK = 'Chưa có người phụ trách';
const NO_DUE_DATE_FALLBACK = 'Chưa có hạn';

/** `MeetingDetailResponse.summary` → the shape `MeetingSummarySection` renders. */
export function toMeetingSummary(meetingId: string, summary: string | null): MeetingSummary {
  return { meetingId, paragraph: summary ?? NO_SUMMARY_FALLBACK };
}

/** `DD/MM` from an ISO date, matching the design's due-date format. */
function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/**
 * `MeetingActionItem` → the shape `ActionItemCard` renders. There is no
 * entity-name lookup available on the client yet, so `assignee_entity_id` is
 * shown as-is rather than invented as a display name — a real name would
 * require a `/entities` resolution this phase does not own.
 */
export function toActionItem(item: MeetingActionItem): ActionItem {
  return {
    id: item.id,
    title: item.content,
    assignee: item.assignee_entity_id ?? NO_ASSIGNEE_FALLBACK,
    due: item.due_date ? formatDueDate(item.due_date) : NO_DUE_DATE_FALLBACK,
  };
}
