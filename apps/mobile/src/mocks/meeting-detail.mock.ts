/**
 * Summary paragraph and action items for the Sprint Review meeting detail
 * screen, transcribed from `design/screen-08-tong-quan-cuoc-hop.png`.
 */
import type { ActionItem, MeetingSummary } from './types';

export const MEETING_SUMMARY: MeetingSummary = {
  meetingId: 'sprint-review',
  paragraph:
    'Cuộc họp tập trung vào tiến độ phát triển API, đánh giá các vấn đề về authentication và thảo luận kế hoạch cho bản phát hành tiếp theo.',
} as const satisfies MeetingSummary;

export const ACTION_ITEMS: readonly ActionItem[] = [
  {
    id: 'action-1',
    title: 'Hoàn thiện API docs',
    assignee: 'Bình',
    due: '15/05',
  },
  {
    id: 'action-2',
    title: 'Sửa lỗi authentication',
    assignee: 'Minh',
    due: '16/05',
  },
  {
    id: 'action-3',
    title: 'Test hiệu năng backend',
    assignee: 'Huy',
    due: '18/05',
  },
] as const satisfies readonly ActionItem[];
