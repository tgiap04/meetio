# Live Gemini check — Phase 12 + 13 (2026-09-26)

Keys: 11 in GEMINI_API_KEY — 10 OK, **key #10 rejected by Google ("API key not valid")**; the pool drops it at runtime.
Remove or replace it in `.env`.

## Phase 12 — `yarn workspace @meetio/api gemini:check`
- countTokens works on gemini-embedding-001 (real token accounting holds).
- Embeddings 768 dims; golden paraphrase queries 5/5 top-1 (sim 0.72–0.82).

## Phase 13 — `yarn workspace @meetio/api graph:check` (new script)
Synthetic 60-minute Vietnamese meeting, 600 segments → 21 chunks, real handlers chunk → embed → extract → resolve.

| Run | Model | extract | resolve | NFR < 120s | Schema | Entities | Expected 9 found once |
|-----|-------|---------|---------|------------|--------|----------|-----------------------|
| 1 (sequential groups) | gemini-2.5-flash | 411.0s | 9.0s | FAIL | 21/21 | 52 | 6 |
| 2 (4 groups in parallel, tighter prompt, category-word normalizing) | gemini-2.5-flash | 101.9s | 4.7s | PASS | 21/21 | 28 | 8 |
| 3 (+ "khách hàng" prefix, default model 2.5-flash) | gemini-2.5-flash | 79.9s | 4.3s | **PASS (84.2s)** | 21/21 | 25 | **9** |

- gemini-flash-latest: every full run failed with HTTP 503 "model is currently experiencing high demand", even
  after 6 attempts over ~30s; a single call succeeded in a probe. User decision: default text model → gemini-2.5-flash.
- Runner backoff for 5xx changed from 1s, 4s (3 calls) to 1, 2, 4, 8, 16s with jitter (`GEMINI_MAX_RETRIES`, default 5).
- responseSchema honoured: no answer failed validation across ~18 extraction calls.

## Merge-suggestion threshold (input to OQ-03, not a substitute for the gold set)
Run 1 (at 0.85): true duplicates scored 0.96–0.98 (Vietcombank 0.983, Meetio 0.978); wrong pairs up to 0.948
("Google Cloud ↔ Nhóm hạ tầng"), and two different people 0.914 ("Anh Bình ↔ Tuấn").
→ default `ENTITY_SUGGEST_THRESHOLD` raised to 0.95. Note: the local `.env` still sets 0.85, which overrides it.

## Remaining
- OQ-03 gold set (10 real meetings labelled) → `graph:eval gold.json`.
- Same concept extracted under two types ("công cụ kiểm thử tự động" product/other) is not joined — tier 1 and
  suggestions are same-type only. Low impact; revisit with the gold set.
- 84s leaves ~30% headroom at 4 groups in flight; a longer meeting or a slower model day can exceed 120s.

## Phase 14 — summarize step in `graph:check` (same synthetic 60-minute meeting, gemini-2.5-flash)

| Run | summarize | NFR < 60s | Points / decisions | Action items: assignee | Relative deadlines |
|-----|-----------|-----------|--------------------|------------------------|--------------------|
| 1 | 17.6s | PASS | 7 / 3, all cited | 4/4 right person | "thứ Sáu" → 2026-09-26 (the meeting day, a Saturday) ✗; "thứ Hai" → 09-29 ✗ |
| 2 (weekday added to prompt) | 26.0s | PASS | cited | 6/6 right person or empty | "thứ Sáu" → 10-02 ✓, "thứ Hai" → 09-28 ✓, "thứ Tư tuần sau" → 09-30 ✓ |

Directional only for OQ-02 (one synthetic meeting); the gold set of real meetings is still needed.
