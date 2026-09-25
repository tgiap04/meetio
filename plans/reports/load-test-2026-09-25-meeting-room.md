# Load test — /meeting-room (phase-05 step 8)

- Date: 2026-09-25, local docker Postgres 15 + Redis 7, API built from the phase 04–05 working tree, single process
- Command: `yarn workspace @meetio/api load-test --seconds 600 --url http://localhost:3997` (20 meetings × 2 segments/s × 600 s)
- Batch window: 200 ms (SEGMENT_BATCH_WINDOW_MS default)

```
Load test: 20 meetings × 2 seg/s × 600s against http://localhost:3997
{
  "wall_seconds": 603,
  "segments_sent": 24000,
  "acks": 24000,
  "errors": 0,
  "error_sample": [],
  "meetings_with_missing_or_duplicate_rows": 0,
  "ack_ms": {
    "p50": 225.48275000002468,
    "p95": 252.63516599999275,
    "p99": 372.03349999996135,
    "max": 588.4867499999818
  }
}
PASS: every segment acked and stored exactly once, p95 ack < 500ms
```

p50 ≈ 225 ms is dominated by the 200 ms batching window; the write itself adds ~25 ms. Lowering the window trades DB round trips for latency.

Note: the three post-review fixes (error-filter message, end missing-seq scan moved before the lock, paused index) came after this run; none touches the segment ack path.
