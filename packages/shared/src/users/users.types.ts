import type { PublicUser } from '../auth/user.types';

/**
 * Account endpoints request/response contracts.
 * Source of truth: docs/api-spec.md §2 (Tài khoản).
 */

/** `GET /users/me` — profile, storage settings, and current month's consumption. */
export interface GetMeResponse {
  user: PublicUser;
  current_month_tokens_used: number;
  usage: TokenUsage;
}

/** This calendar month's AI usage against the user's budget (NFR-07). */
export interface TokenUsage {
  used: number;
  /** Null = no cap (OQ-04: no default budget). */
  budget: number | null;
  /** 0–100, null without a budget. */
  percent: number | null;
  /** At or above 80% of the budget. */
  warning: boolean;
}

/** `PATCH /users/me` — every field optional; only supplied fields are updated. */
export interface UpdateMeRequest {
  display_name?: string;
  retention_days?: number | null;
  notification_settings?: Record<string, boolean>;
}

export type UpdateMeResponse = PublicUser;

/** `POST /users/me/consent` — records the recording-consent milestone. */
export type RecordConsentRequest = Record<string, never>;

export interface RecordConsentResponse {
  recording_consent_at: string;
  consent_version: number;
}

/**
 * `DELETE /users/me` — soft-deletes the account; hard delete follows after 30 days.
 *
 * Exactly ONE of the two fields must be present; the server picks which one
 * is required based on whether the account has a `password_hash` set.
 */
export interface DeleteMeRequest {
  password?: string;
  google_id_token?: string;
}
