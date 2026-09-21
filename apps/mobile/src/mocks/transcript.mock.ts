/**
 * The four transcript lines for the Sprint Review meeting, transcribed from
 * `design/screen-09-transcript.png` (all four rows) and cross-checked against
 * `design/screen-06-ghi-am-truc-tiep.png`, which draws the first two live and
 * is the only screen that shows a translation — attached to the first line
 * only, exactly as the design does.
 *
 * The speaker names and avatars the design draws are deliberately absent: the
 * recording is ambient audio off a laptop speaker and cannot be attributed to
 * a person (US-13, dropped 2026-09-21).
 */
import type { TranscriptLine } from './types';

export const TRANSCRIPT_LINES: readonly TranscriptLine[] = [
  {
    id: 'line-1',
    timestamp: '00:02',
    text: 'Hôm nay chúng ta sẽ tập trung vào phần API của dự án, đặc biệt là phần authentication.',
    translation: 'Today we will focus on the API of the project, especially the authentication part.',
  },
  {
    id: 'line-2',
    timestamp: '00:16',
    text: 'Phần backend hiện tại đã hoàn thành khoảng 70% rồi, chỉ còn một số bug nhỏ.',
  },
  {
    id: 'line-3',
    timestamp: '00:42',
    text: 'Về phần authentication, chúng ta nên sử dụng JWT thay vì session.',
  },
  {
    id: 'line-4',
    timestamp: '01:15',
    text: 'Em đồng ý, JWT sẽ đơn giản hơn trong việc triển khai.',
  },
] as const satisfies readonly TranscriptLine[];
