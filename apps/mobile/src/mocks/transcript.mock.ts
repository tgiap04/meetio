/**
 * The four transcript lines for the Sprint Review meeting, transcribed from
 * `design/screen-09-transcript.png` (all four rows) and cross-checked against
 * `design/screen-06-ghi-am-truc-tiep.png`, which draws the first two live and
 * is the only screen that shows a translation — attached to the first line
 * only, exactly as the design does.
 */
import type { TranscriptLine } from './types';

export const TRANSCRIPT_LINES: readonly TranscriptLine[] = [
  {
    id: 'line-1',
    speaker: 'Nguyễn Văn Anh',
    initials: 'NA',
    timestamp: '00:02',
    text: 'Hôm nay chúng ta sẽ tập trung vào phần API của dự án, đặc biệt là phần authentication.',
    translation: 'Today we will focus on the API of the project, especially the authentication part.',
  },
  {
    id: 'line-2',
    speaker: 'Lê Thị Mai',
    initials: 'LM',
    timestamp: '00:16',
    text: 'Phần backend hiện tại đã hoàn thành khoảng 70% rồi, chỉ còn một số bug nhỏ.',
  },
  {
    id: 'line-3',
    speaker: 'Nguyễn Văn Anh',
    initials: 'NA',
    timestamp: '00:42',
    text: 'Về phần authentication, chúng ta nên sử dụng JWT thay vì session.',
  },
  {
    id: 'line-4',
    speaker: 'Trần Minh Quân',
    initials: 'TQ',
    timestamp: '01:15',
    text: 'Em đồng ý, JWT sẽ đơn giản hơn trong việc triển khai.',
  },
] as const satisfies readonly TranscriptLine[];
