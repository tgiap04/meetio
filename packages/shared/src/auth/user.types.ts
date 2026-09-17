/**
 * Public, wire-facing shape of a user (never includes `password_hash`).
 * Source of truth: docs/data-model.md `users` table.
 */
export interface PublicUser {
  id: string;
  email: string;
  display_name: string;
  retention_days: number | null;
  recording_consent_at: string | null;
  monthly_token_budget: number;
  /** Read-back for `UpdateMeRequest.notification_settings`. Defaults to `{}`. */
  notification_settings: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}
