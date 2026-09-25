/**
 * Push notification contracts (US-30).
 * Source of truth: docs/api-spec.md §2.
 */

/** `POST /users/me/push-tokens` — register this device's Expo push token. Idempotent. */
export interface RegisterPushTokenRequest {
  /** `ExponentPushToken[...]` from expo-notifications `getExpoPushTokenAsync`. */
  token: string;
  platform: 'ios' | 'android';
}

/** `DELETE /users/me/push-tokens` — on logout, or when the user turns notifications off. */
export interface UnregisterPushTokenRequest {
  token: string;
}

/**
 * Keys in `users.notification_settings`. A missing key means ON: a user who
 * never opened settings still gets told their meeting is ready.
 */
export const NotificationSetting = {
  MEETING_READY_PUSH: 'meeting_ready_push',
} as const;

/**
 * Data carried by the "meeting ready" push. The visible text is deliberately
 * generic — meeting content is personal data (NFR-01) and push payloads pass
 * through Expo, Apple and Google servers — so only the id travels.
 */
export interface MeetingReadyPushData {
  type: 'meeting_ready';
  meeting_id: string;
}
