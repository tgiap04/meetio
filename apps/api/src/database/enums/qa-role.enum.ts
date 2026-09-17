/**
 * Speaker role of a Q&A message.
 *
 * NOTE: this is intentionally NOT one of the 5 PG enum types created in
 * migrations (`meeting_status`, `entity_type`, `action_status`, `job_step`,
 * `job_status` — see phase-02-database-schema.md step 4). `qa_messages.role`
 * is stored as a plain `varchar` with a CHECK constraint instead, so the
 * database keeps exactly 5 named enum types as specified. This union is the
 * compile-time contract for that column.
 */
export const QA_ROLES = ['user', 'assistant'] as const;
export type QaRole = (typeof QA_ROLES)[number];
