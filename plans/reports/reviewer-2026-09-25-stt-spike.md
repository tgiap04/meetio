# Review · Phase 00 STT feasibility spike

Scope: `spikes/stt-feasibility/` (all files new/untracked). Plan:
`plans/260917-1821-meetio-full-implementation/phase-00-spike-stt-feasibility.md` +
`clarifications.md` (session 2026-09-25). Read-only review.

## Assessment

Solid, well-documented spike code with an unusually good adversarial test suite for its size —
but the adversarial suite is currently **red**, and one of the two failures is proof of a real
measurement-validity bug in the restart loop, and a second, independent issue means the on-device
guarantee the whole spike exists to check is not actually enforced on a chunk of the Android
install base. Both must be fixed or explicitly documented before any real measurement run is
trusted for the architecture gate.

`npm run typecheck` passes clean. `npm test` (36 tests): **34 pass, 2 fail** — see Critical #2.

## Critical

**1. Late/cross-session events get silently attributed to the wrong session — corrupts exactly the numbers this spike measures.**
`src/recognition-controller.ts:125-151` — `handleStart`, `handleResult`, `handleError`, `handleEnd`
each guard only on a single controller-wide `sessionEnded` boolean, not on which session the
underlying native callback actually belongs to:
```ts
handleResult(text: string, isFinal: boolean) {
  if (sessionEnded) return;   // true only while the CURRENT session is alive — no session token check
  ...
}
```
`src/expo-recognizer-adapter.ts:35-47` binds the native listeners once for the run's whole
lifetime and forwards every callback straight into these methods with no session id attached
(the native module itself never reports one). Sequence that breaks it: session `s1` dies
(`handleEnd`) → 100ms restart timer fires → `s2` launches (`sessionEnded = false`, `sessionId =
's2'`) → a **stale native event that actually belongs to the dead `s1` recognizer** (an Android
`SpeechRecognizer` "busy"/delayed-callback race, which the code's own 100ms-not-500ms restart gap
comment at `recognition-controller.ts:38` explicitly acknowledges as a live risk) arrives and is
now logged with `session_id: 's2'` and merged into `s2`'s transcript. `analysis/parse-session-log.mjs`
trusts `session_id` at face value, so this silently pollutes `wordsLost`-per-restart and WER for a
session that never actually heard that text, and a late stray `end` would end the *new* session
outright, inflating the restart count.

This is not hypothetical — it is already caught and reproduced by the repo's own test:
`src/__tests__/recognition-controller-adversarial.test.ts:49-71` ("late event from old session
after restart does not affect new session") **fails** on a clean checkout.

Fix: give every session a monotonic generation id captured at `launchSession()`; unbind and
rebind the native listeners per session (closures capturing that generation) and drop any
callback whose generation doesn't match the currently-active one. Document that this narrows but
cannot fully close the window, since the native module gives no session id of its own — call that
residual risk out in README's "known risks" section.

**2. Checked-in test suite is red — `npm test` fails 2 of 36.**
```
✖ late event from old session after restart does not affect new session   (src/__tests__/recognition-controller-adversarial.test.ts:49)
✖ handleError then immediate stop does not double-schedule                (src/__tests__/recognition-controller-adversarial.test.ts:127)
```
The first is Critical #1 above, proven, not theoretical. The second: calling `stop()` while a
pending "error-without-end" timer (`errorWithoutEndMs`, `recognition-controller.ts:139-147`) is
still armed causes `stop()` to cancel that timer and log `user_stop`/`run_stop` — **no `auto_stop`
is ever recorded for the session that errored**, so the log loses the distinction between "died
from an unresolved error, then the operator happened to stop" and "clean stop." Whether the fix is
in the controller (always record the terminal reason) or in the test's expectation, a repo
instruction says never wave through failing tests to get a green build — this must be resolved
either way before the spike is used to gather trusted numbers. `git status`/plan record these
files as brand new, so this was never green to begin with.

**3. `requiresOnDeviceRecognition` is not enforced on Android below API 33 — audio can silently leave the device on exactly the runs meant to prove it doesn't.**
`src/expo-recognizer-adapter.ts:20` and `run-config.ts` correctly ask for on-device recognition,
but the native implementation only honors it conditionally
(`node_modules/expo-speech-recognition/android/src/main/java/expo/modules/speechrecognition/ExpoSpeechService.kt:92-97`):
```kotlin
Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && options.requiresOnDeviceRecognition == true ->
    SpeechRecognizer.createOnDeviceSpeechRecognizer(reactContext)
// else: falls through to the regular SpeechRecognizer.createSpeechRecognizer(...)
```
and further down (`ExpoSpeechService.kt:389-391`) the only thing set on pre-Tiramisu (Android <13)
devices is `intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)` — a **hint** the bound
recognition service (typically the Google app) is free to ignore, especially for `continuous`
long-form dictation, which on-device models commonly don't support and fall back to network for.
`src/device-capabilities.ts` records `Device.osVersion` and `onDeviceSupported` but never checks
or surfaces the API-33 threshold, and neither `README.md` nor `REPORT.md` mention it anywhere.
Any device below Android 13 used for an "on-device" measurement run cannot back the NFR-02
claim ("audio never leaves the device") this spike exists to validate — the plan's own risk
table (`phase-00...md` "Rủi ro") doesn't list this either.

Fix: log the resolved Android SDK level in `run_meta`; in the app UI and README, flag any
`engine: 'on-device'` run on `SDK_INT < 33` as unverifiable, and require the two Android test
devices to be API 33+ before their numbers are used to close OQ-01/NFR-02. (iOS's
`request.requiresOnDeviceRecognition` is properly gated behind `recognizer.supportsOnDeviceRecognition`
in `ExpoSpeechRecognizer.swift:588-590` — no equivalent gap found on iOS.)

## High

**4. `restarts` metric under-counts true restart attempts when a start-timeout retry occurs.**
`src/recognition-controller.ts` logs `restart` in `launchSession()` before calling
`recognizer.start()`, but only logs `start` once the native module actually confirms readiness
(`handleStart`). `analysis/parse-session-log.mjs:46` only creates a `Session` record on a `start`
event (`if (e.event === 'start' && !sessions.has(id))`); if a session's native `start` never
fires (start-timeout path, `recognition-controller.ts:73`), that session id never gets a map
entry, and its `restart`/`error`/`auto_stop` events are silently dropped at
`parse-session-log.mjs:59-60` (`if (!s || s.endedAt !== null) continue;`). Consequently
`analysis/run-metrics.mjs:92` (`restarts: Math.max(0, ordered.length - 1)`) under-counts whenever
a start-timeout retry happens in the middle of a run, while `background.restartAttempts`
(`run-metrics.mjs:32`, counted from raw `restart` events) does **not** have this blind spot — the
two restart counts that can both land in the same REPORT.md table can silently disagree, and the
headline "how many restarts" figure (one of the plan's five required answers) can read better
than reality. `gapMs`/`wordsLost` stay correct since they're derived only from consecutive real
sessions, so only the restart *count* is wrong, not the dead-time accounting.

Fix: derive `restarts` from raw `restart` events (same source as `background.restartAttempts`)
rather than from the count of successfully-started sessions.

## Medium

**5. Log durability window is real but undocumented in REPORT.md.**
`src/event-log-file.ts:2-4,30-42` buffers and flushes every 2s, plus on `close()` and immediately
on `app_background` (`App.tsx:59-62`) — a reasonable, explicitly-commented trade-off. But a hard
kill (OOM, native crash, force-quit) inside that 2s window loses buffered-but-unflushed lines with
no recovery; `analysis/parse-session-log.mjs:14-18` only tolerates a single truncated *last* JSON
line, not a gap of several whole unflushed lines before a kill. Not a bug, but worth one line in
REPORT.md's method notes so a run with a suspiciously low `lineCount()` isn't mistaken for a clean
result.

**6. `mergeRecognizedText` heuristic can't distinguish an iOS correction from a genuinely new utterance.**
`analysis/parse-session-log.mjs:26-32` — "if next starts with accumulated, replace; else append
with a space" is a reasonable heuristic for Android's per-sentence finals vs. iOS's cumulative
finals, but either direction of misclassification changes WER substitution/insertion/deletion
counts, and there's no engine-tagged segment boundary to verify it against. Not fixable without a
richer native signal; worth a one-line caveat in README's "Cách tính" section so a reviewer of the
final numbers knows this is a heuristic, not a hard guarantee.

**7. iOS background-suspend failure mode has no direct signal in the log.**
`src/background-keepalive.ts:4-6` correctly documents that iOS may suspend the whole process
during the inter-session gap, but nothing in the event stream distinguishes "OS suspended the
process" from "no more speech" — it can only be inferred post-hoc from a run that ends with no
trailing `run_stop` and a long dead gap while `background=true`. Worth documenting that inference
recipe in README so whoever reads REPORT.md doesn't have to rediscover it.

## Edge Cases Turned Up

- Two consecutive failed-start retries in a row before a success (exercised only implicitly by the
  exponential-backoff test, not by the analysis-side "restarts" metric — see Critical/High #4).
- A late event arriving for a session two generations behind the current one (only one generation
  back is exercised by the failing adversarial test) — the same missing-session-token bug applies.
- Android below API 33 running in `on-device` mode — no test or log field surfaces this at all
  (Critical #3).
- `stop()` racing a still-armed `errorWithoutEndMs` timer (Critical #2's second failure).

## Done Well

- `restartDelayMs` lowered from the plan's 500ms to 100ms is deliberately explained in-code
  (`recognition-controller.ts:37-38`) and matches the task's stated rationale (US-11 AC measures
  restart completion, including engine startup, within 500ms — waiting 500ms before even starting
  would guarantee failure).
- Android 14+ foreground-service start ordering is correct: `App.tsx:93` calls `startKeepalive()`
  while the app is still in the foreground (the user just pressed "Bắt đầu"), satisfying Android
  14's ban on starting a microphone foreground service from the background, even for the
  `background`/`locked` run modes that will background the app *after* this call.
- `wordErrorRate` (`analysis/word-error-rate.mjs`) avoids an O(n·m) traceback matrix, keeping only
  two rows of typed arrays — a sensible, explicitly-reasoned choice for ~9k-word 60-minute
  transcripts.
- `normalize-vietnamese-text.mjs` applies NFC before comparison regardless of the source form's
  original normalization, and both reference and hypothesis text go through the same function —
  no asymmetric-normalization bug found.
- `REPORT.md` is an honest template with every result cell empty and an explicit "CHƯA ĐO / no
  estimates" banner — matches the clarification that this session's scope stops at app + analysis
  tool + template, no real numbers yet.
- `write` failure handling in `event-log-file.ts:34-42` re-queues the unflushed buffer instead of
  dropping it silently, and surfaces the error to the UI (`App.tsx:167-169`) rather than pretending
  the run is clean.
- AppState handling correctly treats iOS's `inactive` (control-center swipe) as a non-event,
  avoiding a false `app_background` log entry (`App.tsx:58-59`).

## Actions In Order

1. Fix or accept-and-document the session cross-attribution bug (Critical #1) — this is the one
   finding that can invalidate every future measurement run if left as-is.
2. Get `npm test` green — resolve both adversarial-test failures (Critical #2), which are the
   proof-of-concept for #1 and a second real ambiguity in error-then-stop handling.
3. Add the Android API-33 on-device enforcement gap to `run_meta`/README/REPORT and gate real
   measurement devices on it (Critical #3) before OQ-01/NFR-02 get closed on Android data.
4. Fix the `restarts` under-count (High #4) so REPORT.md's headline restart figure and
   `background.restartAttempts` can't silently disagree.
5. Add the three documentation notes (Medium #5-#7) to README/REPORT before the first real run.

## Numbers

- Type coverage: `tsc --noEmit` clean, 0 errors.
- Test coverage: 36 tests across `src/__tests__` + `analysis/__tests__`; **34 pass, 2 fail**.
- Lint findings: no lint script configured in `package.json` — not run.

## Still Unresolved

- Whether `stop()` after an unresolved error (Critical #2's second failure) should log a synthetic
  `auto_stop` before `user_stop`, or whether the test's expectation is simply wrong — needs a
  product/analysis-owner call on what "died from error, then stopped" should look like in the log
  schema.
- No iOS equivalent of the Android on-device-enforcement gap was found in the code read here, but
  this review did not have a live iOS device to confirm `SFSpeechRecognizer.supportsOnDeviceRecognition()`
  actually reports `false` (rather than "unknown-treated-as-true") on the specific low-tier iOS
  test hardware named in the plan.

**Status:** DONE_WITH_CONCERNS
**Summary:** Spike code is clean and unusually well-tested for its size, but ships with 2 failing tests, one of which proves a real session cross-attribution bug in the restart loop that can corrupt WER/words-lost numbers, plus an independent, undocumented gap where `requiresOnDeviceRecognition` is only a hint (not enforced) on Android below API 33 — directly threatening the NFR-02 claim this spike exists to validate. Typecheck is clean; scope otherwise matches the plan and clarifications.
**Concerns/Blockers:** Critical #1-#3 should be resolved (or explicitly documented as accepted risk with device/version gating) before any measurement run's numbers are used to decide on-device vs. cloud STT.
**Score:** 6/10

---

## Re-inspection (2026-09-25)

Verified in code + by re-running the suite, not taken from the fix summary.

- **Critical #1 (session cross-attribution) — FIXED, verified.** `src/recognition-controller.ts`
  now tracks `awaitingStart` (set in `launchSession`, cleared only by the new session's own
  `handleStart`); `handleResult` drops anything that arrives while `awaitingStart` is true. The
  adversarial test was correctly flipped (`late result from old session before the new session
  starts is dropped`, `recognition-controller-adversarial.test.ts:49-70`) and passes.
- **Critical #2 (red test suite) — FIXED, verified.** `npm test` → **46/46 pass**, `npx tsc
  --noEmit` → clean. The `handleError`-then-`stop()` ambiguity was resolved as documented
  (`user_stop`, no synthetic `auto_stop`; `recognition-controller-adversarial.test.ts:127-148`) —
  a reasonable call: the error line is already in the log and analysis excludes `user_stop` from
  restart-gap accounting, so no information is lost.
- **Critical #3 (Android <13 on-device not enforced) — FIXED for Android, but the same bug is now
  open on iOS. Not sealable.** `src/device-capabilities.ts:42` computes
  `onDeviceEnforced: !android || Number(Platform.Version) >= 33` — correct for Android, but this
  hardcodes `true` for iOS unconditionally, ignoring
  `ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()`. Per
  `node_modules/expo-speech-recognition/ios/ExpoSpeechRecognizer.swift:588-590`, when that native
  check is `false` (device/locale without on-device support), `requiresOnDeviceRecognition` is
  simply never set on the `SFSpeechRecognitionRequest` — no error, no fallback signal, recognition
  just goes to Apple's servers while the app still lets the run start and logs it as
  `engine: 'on-device'`. My original review said "no equivalent gap found on iOS" — that was an
  under-analysis on my part (I checked that the flag *was gated*, not what happens when the gate
  is closed); this re-inspection corrects it. Fix: mirror the Android approach —
  `onDeviceEnforced` on iOS should be `caps.onDeviceSupported`, and `App.tsx`'s existing start-gate
  will then block it for free.
- **High #4 (restarts under-count) — FIXED, verified.** `analysis/run-metrics.mjs:94` now derives
  `restarts` from raw `restart` events, matching `background.restartAttempts`'s methodology.
- **Medium #5 (log durability doc) — FIXED, verified.** `README.md:75-76` documents the 2s
  flush-batch window and the ~2s max loss on a hard kill.
- **New Medium (not previously flagged):** the `onDeviceEnforced` start-gate (`App.tsx:76-80`)
  blocks starting *any* run configuration — including `engine: 'network'`, which needs no
  on-device guarantee — on Android below API 33. This over-blocks the network-engine control
  measurements the plan's clarifications explicitly call for on every device. Should gate only
  when `config.engine === 'on-device'`.
- Medium #6 (`mergeRecognizedText` heuristic undocumented) and Medium #7 (iOS background-suspend
  has no direct log signal) were not addressed this round — still open, still non-blocking.

**Verdict written:** `plans/260917-1821-meetio-full-implementation/evidence/inspection-verdict.json`
— **decision: REWORK**, `criticalCount: 1` (the iOS silent-fallback gap), score 7/10. Not sealed:
`refuted` is non-empty (the "on-device runs cannot silently fall back to network" acceptance
criterion is disproven for iOS) and `unproven` is non-empty (background/locked-screen behavior on
real hardware hasn't been demonstrated — REPORT.md is still pre-measurement). Four of the original
five fix claims verified true by direct re-test, not by trusting the summary.

## Second re-inspection (2026-09-25)

Verified in code, not from the fix summary. `npm test` → **47/47 pass**, `npx tsc --noEmit` →
clean, `npx eslint --max-warnings=0 --ext .ts,.tsx,.mjs spikes/stt-feasibility` re-run independently
→ 0 warnings, `yarn workspaces list --json` re-confirms `spikes/` isn't a member.

- **iOS silent-fallback gap — FIXED, verified, and better than my proposed fix.** I had suggested
  simply gating `onDeviceEnforced` on `supportsOnDeviceRecognition()`. The actual fix goes further,
  and correctly so: `supportsOnDeviceRecognition()` checks the *device's default locale*, not
  `vi-VN` (per `ExpoSpeechRecognitionModule.swift:352-355`), so it can't actually prove vi-VN
  on-device support either. `src/network-probe.ts` (new) does a 3s-timeout `HEAD` to
  `generate_204`; `App.tsx:82-93` now refuses to start any `engine:'on-device'` run while the
  network is reachable, and logs `network_reachable_at_start` in `run_meta` regardless. This is
  the only evidence a JS-level app can actually produce for NFR-02: if it recognizes speech while
  there is provably no network path, the audio could not have left the device — on either
  platform. `viInstalledOnDevice` was also correctly demoted to `boolean | null` (iOS's
  `getSupportedLocales` returns `installedLocales === locales`, so it never meant anything there),
  and `capability-panel.tsx` was updated in lockstep (`missingOffline` now compares `=== false`
  explicitly, so `null` reads as "unknown," not "missing").
- **Over-block Medium — FIXED, verified.** `App.tsx:82` (`if (config.engine === 'on-device') { ... }`)
  confirms the enforcement/offline gate no longer touches `network`-engine runs on any device.
- **Heartbeat Medium (#7) — FIXED, verified.** 30s heartbeat (`App.tsx`, `log-event.ts`) plus
  `maxHeartbeatGapSeconds` in `analysis/run-metrics.mjs:125`, covered by new tests
  (`run-metrics.test.mjs:81,100-103`, both passing, including the null-when-no-heartbeats case).
- **Merge-heuristic doc Medium (#6) — FIXED, verified.** `README.md:67-68` now documents the
  Android-per-sentence vs. iOS-cumulative-final heuristic.
- **Background/locked-screen criterion — accepted as covered, per the brief's literal wording and
  clarifications.md's explicit scope.** Verified past the source level, at the generated
  build-artifact level: `android/app/src/main/AndroidManifest.xml` contains the merged
  `<service ... android:foregroundServiceType="microphone">` plus the two `FOREGROUND_SERVICE*`
  permissions, and `ios/STTSpike/Info.plist` contains `UIBackgroundModes: [audio]`. Whether this
  configuration *survives* a real 60-minute run is exactly what the (still-empty) REPORT.md is
  for, and clarifications.md explicitly scoped that out of this implementation session — so this
  criterion reads as met.
- **New Low finding (not blocking):** the offline gate is a one-time check at `start()`; nothing
  re-checks or logs network reachability during the run. A mid-run reconnect (plausible in the
  plan's own background/locked-screen modes — e.g. a phone rejoining known Wi-Fi when the screen
  wakes) would silently reopen the same fallback risk on iOS with no trace in the log. In practice
  this is covered by the README's operator protocol (stay in airplane mode for the whole on-device
  run), but the app itself doesn't enforce or verify it continuously. Suggest logging
  `isNetworkReachable()` alongside each heartbeat so a reconnect shows up in the JSONL rather than
  silently invalidating the run.

**Verdict rewritten:** `plans/260917-1821-meetio-full-implementation/evidence/inspection-verdict.json`
— **decision: SEALED**, `criticalCount: 0`, score 9/10. `refuted`/`unproven`/`reachableRegressions`
all empty, `contractStatus: CHANGED` (additive: new `heartbeat` event, `network_reachable_at_start`
field, `viInstalledOnDevice` widened to `boolean | null` — no breaking change, sole consumer
(`capability-panel.tsx`) updated and green). Independently re-ran `node -e` against the real
`evidence-validator.cjs` against the written verdict: `{ ok: true, blocking: [], warnings: [] }`
at the `hard` stage.
