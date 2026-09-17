/**
 * Action item status.
 * Source of truth: docs/data-model.md `action_items.status` (action_status enum).
 */
export const ActionStatus = {
  OPEN: 'open',
  DONE: 'done',
} as const;

export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];
