/**
 * Completion state of an action item.
 * Mirrors PG enum `action_status` (see docs/data-model.md §5).
 */
export enum ActionStatus {
  OPEN = 'open',
  DONE = 'done',
}
