import type { MeetingReadyPushData } from '@meetio/shared';

/**
 * Validates the `data` payload of a tapped push notification at the boundary
 * where it enters the app — `expo-notifications` hands it back as `unknown`,
 * and nothing guarantees it's actually a `meeting_ready` push (it could be
 * any other notification type added later, or a malformed payload).
 */
export function isMeetingReadyPushData(data: unknown): data is MeetingReadyPushData {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'meeting_ready' &&
    typeof (data as Record<string, unknown>).meeting_id === 'string'
  );
}
