# Semantic search latency — phase-12 step 7

- Date: 2026-09-26 · local docker Postgres 15 + pgvector 0.8.6 · `yarn workspace @meetio/api perf:search`
- Query: `VectorRepository.searchChunks` — exact per-user nearest neighbours (`ORDER BY (embedding <=> q) + 0`), owner + soft-delete filters in the same statement, limit 11. Another user holds the same number of chunks in the table.

| Chunks for the user | Runs | p50 | p95 | max | Plan |
|---|---|---|---|---|---|
| 7,500 (≈500 meetings, the phase-12 target) | 20 | 41.4 ms | 43.6 ms | 43.6 ms | meetings by `idx_meetings_user_created` → chunks by `idx_chunks_meeting`, top-N heapsort; no HNSW |
| 50,000 | 10 | 293.6 ms | 299.4 ms | 299.4 ms | same shape; execution 215 ms |

Budget: < 2 s (phase-12 NFR). Both pass.

## Why exact instead of HNSW

The phase file asked every vector measurement to assert an HNSW `Index Scan` — a lesson from Phase 02, measured
*without* a per-user filter. With the filter it is the wrong tool: an integration run returned an **empty page**
for a user whose chunks existed, because the HNSW walk (even with `hnsw.iterative_scan`) spent its budget on other
users' vectors and on dead index entries left by earlier deletes. Chunk reconciliation deletes and inserts on
every transcript re-run, so that state recurs in production. Exact per-user search is always complete, and the
numbers above show it is fast enough at 50,000 chunks per user; revisit (partitioning per user, or pgvector
filtered-index features) only if a single user grows far beyond that.
