import { MeetingStatus } from '@meetio/shared';
import type { StatusBadgeStatus } from './status-badge';

/**
 * Maps the server's full meeting lifecycle (`recording` → … → `ready` /
 * `failed`) onto `StatusBadge`'s three-and-a-half visual states. A meeting
 * still being recorded or just ended has not entered the AI pipeline yet, so
 * it reads the same as `queued` here — Library/home rows only ever show
 * meetings that have already ended in practice, but the mapping stays total
 * so a row never crashes on an unexpected status.
 */
export function toStatusBadgeStatus(status: MeetingStatus): StatusBadgeStatus {
  switch (status) {
    case MeetingStatus.READY:
      return 'done';
    case MeetingStatus.PROCESSING:
      return 'processing';
    case MeetingStatus.FAILED:
      return 'failed';
    case MeetingStatus.QUEUED:
    case MeetingStatus.RECORDING:
    case MeetingStatus.PAUSED:
    case MeetingStatus.ENDED:
    default:
      return 'queued';
  }
}
