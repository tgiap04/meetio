# Reviewer report — Phase 14 (summary & action items), 2026-09-26

## Scope
API: `summaries/`, `actions/`, `meetings/meeting-query.service.ts` + mappers + DTOs, migration
`1758000000017`, entities `Meeting`/`ActionItem`, `app.module.ts`. Test-support:
`fake-gemini-server.ts`, `scripted-summary-model.ts`, `e2e-app.ts` close order,
`graph-live-check.mjs` summarize step. Shared: `packages/shared/src/actions`,
`meetings.types.ts`. Mobile: summary/action tabs, `actions.tsx`, Home row, `api/actions.ts`,
action hooks. Depth: full read of every changed/new file in the list above, plus targeted reads
of `export/` (summary rendering) and TypeORM's Postgres driver source to verify a specific claim.

## Assessment
Solid, well-tested implementation of the core contract: citation integrity, anti-guess assignee
resolution, and re-run reconciliation are all correctly built and covered by both integration and
e2e tests with concrete expected values, not just "does not throw." User isolation is swept
exhaustively in the e2e spec (every route, cross-user 404). One real, untested regression:
the bullet-formatted `meetings.summary` text breaks when it reaches the export HTML/PDF path,
which the export code (unchanged in this diff) was never taught to handle. Two other findings
are inherent design trade-offs of the reconciliation approach, correctly reasoned about but worth
recording explicitly since the clarifications don't cover them.

## Critical
None.

## High
**Exported HTML/PDF loses the summary's line structure — no test covers it.**
`apps/api/src/export/render-html.ts:15` wraps `doc.summary` in one `<p>` with no
`white-space: pre-wrap` and no `\n`→`<br>` conversion; `apps/api/src/export/export-document.ts:65`
emits it as one Markdown line. The Phase-14 summary is now built as
(`summarize-step.handler.ts:82-87`) `"• point1\n• point2\n\nQuyết định:\n• decision1"` — literal
single `\n` between bullets, a blank-line break before the heading. HTML collapses all runs of
whitespace (including newlines) to a single space by default, so the exported PDF renders
`"• point1 • point2 Quyết định: • decision1"` as one run-on line — the bullets and the decisions
heading are no longer visually distinguishable. CommonMark has the same problem: a single `\n`
inside a paragraph is a soft break rendered as a space, not a line break, so the Markdown export
degrades the same way (the `• ` characters aren't Markdown list syntax, so no list is formed
either). Confirmed nothing in `export/__tests__/*.spec.ts` exercises a summary with more than the
"not ready" placeholder — this shipped without a test that would have caught it.
Fix: in `render-html.ts`, `esc(doc.summary).replace(/\n/g, '<br>')` (or add
`white-space: pre-wrap` to the summary `<p>`'s class); in `export-document.ts`, either join summary
lines with two trailing spaces + `\n` (Markdown hard break) or render points/decisions as an actual
Markdown list (`- text`) instead of a `• `-prefixed paragraph. Add one export test with a real
multi-point + decision summary and assert the rendered output keeps them on separate lines/list
items.

## Medium
1. **A user-deleted (but never edited) AI action item can come back verbatim on the next re-run.**
   `summarize-step.handler.ts:96-108`: the reconciliation dedup set (`seen`) is built only from
   rows still present in the table after the delete (`kept`). Deleting an AI item removes it from
   that set entirely, with nothing recording "the user rejected this content." If the model
   proposes the same content again on a later run (e.g. after a `changed`/`full` reindex), it is
   re-inserted as if new. This isn't covered by the stated acceptance criterion ("keeps items the
   user ticked, edited or added") or by clarifications.md, which only discusses kept/edited items,
   not deleted ones — so it's plausibly intentional, but it's a real, user-visible surprise ("I
   deleted this and it came back") that's worth either an explicit accepted-tradeoff note next to
   the handler or a small tombstone (e.g. keep a soft-deleted row, or a `rejected_content_hash` set
   scoped to the meeting).
2. **Reconciliation DELETE can race a concurrent user PATCH into an unexpected 404.**
   `actions.service.ts:93-96` (`update`) takes `FOR UPDATE OF a` before writing;
   `summarize-step.handler.ts`'s transaction (89-109) deletes untouched AI rows and re-inserts.
   Traced both orderings against Postgres's READ COMMITTED re-check semantics: if the user's PATCH
   commits first, the DELETE's `WHERE ... is_user_edited = false` correctly re-evaluates and skips
   the now-edited row (no data loss — verified against the actual Postgres UPDATE/DELETE
   predicate-recheck behavior, not assumed). But if the reconciliation DELETE commits first, the
   user's concurrent PATCH's `SELECT ... FOR UPDATE` finds nothing and throws
   `itemNotFound()` → a legitimate concurrent edit gets a 404 instead of applying, even though the
   "same" content will typically reappear seconds later as a new row with a new id. No correctness
   or security issue, but the API result (404 on a route the user just saw the item on) is
   confusing without a comment explaining it's expected under this design. Worth a one-line comment
   at the DELETE call site.

## Low
1. `actions.service.ts:46-51` (`list`) filters by `COALESCE(keep.id, ae.id) = $3` for the assignee
   filter, which can't use an index directly (`idx_action_items_assignee` covers `ae.id` pre-join,
   not the merge-aware value) — fine at the personal-scale row counts this app targets, worth an
   index or materialized merge-resolution later if action-item counts grow.
2. Pipeline re-delivery idempotency for the `summarize` step relies on BullMQ's `jobId` dedup
   (`stepJobId(meetingId, run, step)` in `bull-step-queue.ts`) rather than an application-level
   lock inside this diff — consistent with how earlier phases handle redelivery, not a new gap
   introduced by Phase 14, flagging only because the task asked to check it explicitly.

## Edge Cases Turned Up
- Ambiguous assignee (two people both named "Lan" mentioned in the same meeting) → null, tested
  (`summarize-step.integration.spec.ts:94-115`).
- Assignee named but not mentioned in *this* meeting ("Huy") → null, same test.
- Two-tier merge preserves citations back to real chunk ids across the merge boundary — traced the
  `parts`/`ids()` closure in `summary-generator.ts:53-59` by hand; confirmed no citation can survive
  the merge without a real chunk id behind it.
- `DELETE /actions/:id` on an already-deleted id → 404 the second time (e2e spec:99-100) — no
  silent success.
- Cross-user assignee ownership on both create and update paths (`ownedPerson`, `actions.dto` +
  service) is tested against a stranger's person entity, not just against a stranger's own action
  item (`actions.e2e.spec.ts:123-128`) — this is the specific "assignee_entity_id ownership on
  create/update" check the task asked for, and it's real, not assumed.
- `remove()`'s `[, deleted] = await this.dataSource.query(...)` on a DELETE without RETURNING:
  verified directly against `node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:213-224` —
  TypeORM's Postgres driver returns `[raw.rows, raw.rowCount]` for DELETE/UPDATE even without
  RETURNING, so this destructure is correct, not a latent bug.

## Done Well
- Citation integrity is structural, not a convention: `summary-schema.ts`'s `parseSummary` drops
  any point/decision/action whose sources don't resolve to a known label — there is no code path
  that can store an uncited line.
- `segment_seq` is computed once, correctly, from the real transcript chunk
  (`summarize-step.handler.ts:77`), and the integration test pins exact expected values, not just
  "is a number."
- NFR-04 held to precisely: the only log line in the summarize path
  (`summary-generator.ts:108`) logs meetingId + attempt count + a schema-violation reason string
  that is itself built from field names, never from the model's raw text or the transcript.
- `e2e-app.ts`'s teardown reorder (kill the server, then delete users) is a real fix for a real
  deadlock class — deleting rows a live pipeline step still holds locks on.
- Shared-type change is genuinely additive: `MeetingActionItem` and `MeetingDetailResponse` gained
  fields, dropped none; `meeting-query.service.ts` and `actions.service.ts` now share one
  `loadActionItems`/`withoutMeeting` implementation instead of the old duplicated
  `toMeetingActionItem` mapper — less code, one source of truth for the assignee-merge-aware join.
- The e2e suite's isolation sweep is exhaustive on purpose: every route (summary, per-meeting
  actions, list, filters, create, update, delete) gets a cross-user 404, plus a malformed-UUID 404
  and two validation 400s, in one test.

## Actions In Order
1. Fix the export summary line-break loss (High) — `render-html.ts`, `export-document.ts`, plus a
   real test with a multi-point + decision summary.
2. Decide and document (or fix) the delete-then-resurrect gap for AI action items (Medium 1).
3. Add a one-line comment at the reconciliation DELETE explaining the 404-on-race trade-off
   (Medium 2) — no code change required, just make the accepted behavior legible to the next
   reader.
4. Low items — defer, not blocking.

## Numbers
- Type coverage: typecheck clean (per stated gates).
- Test coverage: api unit 348, e2e 111, schema 5, mobile 985 — all reported green; export summary
  multi-line rendering is the one gap identified above (no negative test needed — a positive test
  is missing).
- Lint findings: 0 (eslint clean per stated gates).

## Still Unresolved
- OQ-02 (assignee-resolution accuracy on a real gold dataset) is genuinely unproven — the live
  `graph:check` run (4/4 then 6/6 correct-or-empty assignees) is directional only, on one synthetic
  meeting, not the hand-labelled gold set the plan calls for. Recorded honestly, not counted as
  disproven.

**Status:** DONE_WITH_CONCERNS
