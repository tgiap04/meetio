# Implementer Report — Phase 12 (mobile half): Search tab wired to the real API

**Status**: DONE

## Scope

Wired the existing Search tab (`apps/mobile/app/(app)/(tabs)/search.tsx`, built from
design screen-13) to the real search endpoints per `plans/260917-1821-meetio-full-implementation/clarifications.md`
(Session 2026-09-26). All changes are inside `apps/mobile/**`; `packages/shared/**`
(the `@meetio/shared` `SearchQuery`/`SearchResultItem`/`SearchResponse` contract
was already in place) and `apps/api/**` were not touched.

## What changed

- **Semantic search ("Transcript" chip)**: `GET /search?q=&limit=&offset=`,
  paged by `next_offset`. Debounced ~400ms, only fires for a query of 2+
  trimmed chars (never for empty/1-char, per the rate-limit note). A 503
  `AI_SERVICE_UNAVAILABLE` shows "Tìm kiếm ngữ nghĩa tạm thời không khả dụng."
  with retry; 429 `QUOTA_EXCEEDED`/`RATE_LIMITED` and everything else route
  through the existing `error-messages.ts` table.
- **Title search ("Meeting" chip)**: reuses the Library tab's
  `useInfiniteMeetingsQuery`/`MeetingListRow`, now gated by a new `enabled`
  option (defaults `true`, so the Library tab's own call site is unaffected).
- **"Tất cả" chip**: both sections render together; **"Node"/"Người" are
  gone** (hidden per decision, not just filtered) and the **"Tài liệu" mock
  group is dropped** — the Transcript section replaces it.
- **Transcript jump**: tapping a Transcript result pushes
  `MEETING_TRANSCRIPT_ROUTE` with `{ id, seq: String(segment_seq) }`. The
  transcript screen (`meeting-transcript.tsx` → `RealTranscriptScreen`) now
  accepts an optional `initialSeq`, threads it into
  `useInfiniteSegmentsQuery` as the initial (inclusive) `from_seq` — so the
  first page fetched starts exactly at the match, no need to page from the
  top — and a new `useScrollToInitialSeq` hook scrolls to it once that
  segment appears, exactly once per screen instance.
- **`onScrollToIndexFailed`**: while wiring the seq-jump I found `FlatList`'s
  `scrollToIndex` throws in this list (no `getItemLayout`, variable-height
  rows) whenever the target index hasn't been measured yet — a latent gap in
  the pre-existing `jumpToLastRead` path too, just never exercised because
  `readLastReadSeq` always resolved `null` in that screen's tests. Added a
  real fallback (`utils/scroll-to-index-fallback.ts`): approximates the
  offset from the reported average row height, landing it close enough for
  the next measurement pass to correct.
- **Mock cleanup**: removed `mocks/search-results.mock.ts` and the
  `Search*`/`*SearchGroup` types from `mocks/types.ts` (confirmed via grep
  that nothing outside the search feature and `mocks.test.ts` referenced
  them — the graph/other screens use unrelated mock exports).

## Files Touched

New:
- `apps/mobile/src/api/search.ts` (+15) — `searchTranscripts`
- `apps/mobile/src/api/search.test.ts` (+56)
- `apps/mobile/src/api/semantic-search-error-message.ts` (+20)
- `apps/mobile/src/api/semantic-search-error-message.test.ts` (+26)
- `apps/mobile/src/hooks/use-search-query.ts` (+25)
- `apps/mobile/src/hooks/use-search-query.test.tsx` (+66)
- `apps/mobile/src/hooks/use-meetings-query.test.tsx` (+51) — covers the new `enabled` option
- `apps/mobile/src/hooks/use-segments-query.test.tsx` (+56) — covers `initialFromSeq`
- `apps/mobile/src/hooks/use-scroll-to-initial-seq.ts` (+28)
- `apps/mobile/src/hooks/use-scroll-to-initial-seq.test.tsx` (+70)
- `apps/mobile/src/utils/scroll-to-index-fallback.ts` (+34)
- `apps/mobile/src/utils/scroll-to-index-fallback.test.ts` (+17)
- `apps/mobile/src/components/search/semantic-result-row.tsx` (+24)
- `apps/mobile/src/components/search/semantic-result-row.test.tsx` (+47)
- `apps/mobile/src/components/search/load-more-button.tsx` (+28)
- `apps/mobile/src/components/search/load-more-button.test.tsx` (+28)
- `apps/mobile/src/components/transcript/meeting-transcript-route.test.tsx` (+65)

Modified:
- `apps/mobile/app/(app)/(tabs)/search.tsx` (rewritten, 189 lines)
- `apps/mobile/app/(app)/meeting-transcript.tsx` (+9) — parses optional `seq`
- `apps/mobile/src/components/search/search-result-section.tsx` (rewritten generic, 31 lines)
- `apps/mobile/src/components/search/search-result-section.test.tsx` (rewritten, 32 lines)
- `apps/mobile/src/components/search/search-screen.test.tsx` (rewritten, 332 lines)
- `apps/mobile/src/components/transcript/real-transcript-screen.tsx` (195 lines, net +5 after extracting the two hooks above)
- `apps/mobile/src/components/transcript/real-transcript-screen.test.tsx` (+22)
- `apps/mobile/src/hooks/use-meetings-query.ts` (+14) — added `enabled` option
- `apps/mobile/src/hooks/use-segments-query.ts` (+9) — added `initialFromSeq`
- `apps/mobile/src/utils/meeting-formatting.ts` (+13) — added `formatOptionalDate`
- `apps/mobile/src/utils/meeting-formatting.test.ts` (+9)
- `apps/mobile/src/mocks/types.ts` (-53) — removed `Search*` mock types
- `apps/mobile/src/mocks/index.ts` (-1)
- `apps/mobile/src/mocks/mocks.test.ts` (-30)
- `apps/mobile/src/navigation/navigation-graph.test.tsx` (loosened one regex to allow the new `seq` param alongside `id`)

Deleted:
- `apps/mobile/src/components/search/search-result-row.tsx` / `.test.tsx` (superseded by `semantic-result-row.tsx` + inline `MeetingListRow` usage, matching the Library tab's own pattern)
- `apps/mobile/src/mocks/search-results.mock.ts`

## Checks

- Typecheck: clean (`yarn workspace @meetio/mobile typecheck`)
- Lint: clean (`npx eslint --max-warnings=0 apps/mobile`)
- Unit tests: 797 passing, 0 failing (`yarn workspace @meetio/mobile test`), run twice to confirm no flakiness
- All touched files are kebab-case; every source file (excluding tests, matching this repo's existing precedent for test-file length) is under 200 lines

## Acceptance Criteria

- [x] "Transcript" chip shows semantic `/search` results as excerpt cards; tap opens the transcript screen scrolled to `segment_seq`
- [x] "Meeting" chip shows title-search results via the existing `MeetingListRow`/Library pattern; tap opens meeting detail
- [x] "Tất cả" shows both sections together
- [x] "Node" chip and "Người" group are gone entirely (not merely hidden by a runtime filter with dead code behind it — the case was deleted along with the chip)
- [x] "Tài liệu" mock group dropped
- [x] Empty query → hint EmptyState; no results → "Không tìm thấy kết quả phù hợp"
- [x] Debounced ~400ms via the existing `use-debounced-value` hook; no search fires for empty/1-char semantic queries
- [x] 503 `AI_SERVICE_UNAVAILABLE` → friendly retryable Vietnamese copy; 429s and others → existing `error-messages.ts` table
- [x] No mock data used anywhere on the real screen
- [x] Search mocks removed (confirmed nothing else referenced them)

## Issues Encountered / Deviations

- **Pre-existing latent bug found, not introduced by this change**: `RealTranscriptScreen`'s `FlatList` had no `onScrollToIndexFailed`/`getItemLayout`, so any `scrollToIndex` call to an unmeasured row (the existing `jumpToLastRead`, and now the new seq-jump) throws in both the real app and tests. Fixed for both call sites with `utils/scroll-to-index-fallback.ts` rather than leaving it as a TODO — a real, if approximate, fallback. Flagging in case the team wants a follow-up pass adding a real `getItemLayout` for exact positioning.
- `apps/mobile/src/navigation/navigation-graph.test.tsx` required a one-line regex loosening (still asserts screen 09 reads `id` via `useLocalSearchParams`, just no longer assumes it's the *only* field) — needed because the route now also accepts `seq`. In scope (`apps/mobile/**`) and did not weaken the check's intent.
- Two exploratory react-query hook tests (`use-search-query.test.tsx`) initially raced on `notifyManager`'s macrotask-based batching; fixed by awaiting a real timer tick (`setTimeout(resolve, 0)`) inside `act()` instead of only microtasks. Re-ran the full suite twice after the fix with no flakiness.
- Unrelated `.env.example` diff visible in `git status` (Gemini key-pool env vars) is from the parallel backend work on `apps/api` — not touched by me.

**Status:** DONE
**Summary:** Search tab now calls the real `/search` (semantic, "Transcript") and `/meetings?q=` (title, "Meeting") endpoints, drops the "Node"/"Người"/"Tài liệu" mock groups, and taps into a Transcript result jump straight to `segment_seq` in the transcript screen. Typecheck, lint, and the full mobile test suite (797 tests) are all green.
**Concerns/Blockers:** None blocking. One follow-up worth a ticket: `RealTranscriptScreen`'s `FlatList` uses an approximated `onScrollToIndexFailed` fallback rather than a precise `getItemLayout`, since rows are variable-height — good enough for the jump-in UX but not pixel-exact on the first attempt for very long transcripts.
