/**
 * The four meetings that recur across screens 04 (home), 12 (library) and 13
 * (search). One array, three views of it — never three separate lists.
 * Transcribed from `design/screen-04-trang-chu.png` (first three rows) and
 * `design/screen-12-thu-vien.png` (all four rows, including Marketing Brief,
 * which appears only there).
 */
import type { Meeting } from './types';

export const MEETINGS: readonly Meeting[] = [
  {
    id: 'sprint-review',
    title: 'Sprint Review',
    durationMinutes: 42,
    date: '12/05/2025',
    status: 'done',
    initials: 'SR',
  },
  {
    id: 'client-discussion',
    title: 'Client Discussion',
    durationMinutes: 28,
    date: '10/05/2025',
    status: 'done',
    initials: 'CD',
  },
  {
    id: 'project-planning',
    title: 'Project Planning',
    durationMinutes: 51,
    date: '08/05/2025',
    status: 'processing',
    initials: 'PP',
  },
  {
    id: 'marketing-brief',
    title: 'Marketing Brief',
    durationMinutes: 38,
    date: '01/05/2025',
    status: 'done',
    initials: 'MB',
  },
] as const satisfies readonly Meeting[];
