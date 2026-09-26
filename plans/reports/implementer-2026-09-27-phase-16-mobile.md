# Phase 16 (mobile) — consent v2, privacy policy screen, AI usage, retention picker

**Status**: DONE

## Files touched

New:
- `apps/mobile/app/(app)/privacy-policy.tsx` (+33) — full policy screen
- `apps/mobile/src/content/privacy-policy.ts` (+160) — structured content mirroring `docs/privacy-policy.md`
- `apps/mobile/src/content/privacy-policy.test.ts` (+62) — doc-drift test
- `apps/mobile/src/components/privacy-policy/privacy-policy-content.tsx` (+76) — renderer
- `apps/mobile/src/components/privacy-policy/privacy-policy-screen.test.tsx` (+59)
- `apps/mobile/src/components/consent/consent-screen.test.tsx` (+77)
- `apps/mobile/src/components/settings/settings-retention-picker.tsx` (+76)
- `apps/mobile/src/components/settings/settings-retention-picker.test.tsx` (+72)
- `apps/mobile/src/components/settings/settings-usage-section.tsx` (+47)
- `apps/mobile/src/components/settings/settings-usage-section.test.tsx` (+48)

Modified:
- `apps/mobile/app/(app)/consent.tsx` — corrected copy (no longer claims audio is stored), added link to full policy
- `apps/mobile/app/(app)/(tabs)/index.tsx` — gates on `consent_required` instead of `recording_consent_at`
- `apps/mobile/app/(app)/(tabs)/settings.tsx` — wires usage section, retention picker, privacy-policy nav
- `apps/mobile/src/api/axios-client.ts` — global 403 `CONSENT_REQUIRED` → redirect to consent screen
- `apps/mobile/src/api/error-messages.ts` — `CONSENT_REQUIRED` fallback message (required by `Record<ApiErrorCode,string>`)
- `apps/mobile/src/components/settings/settings-about-section.tsx` — "Chính sách bảo mật" now navigates
- `apps/mobile/src/components/settings/settings-account-section.tsx` — retention field replaced by picker
- `apps/mobile/src/navigation/app-routes.ts` — `PRIVACY_POLICY_ROUTE`
- Test files updated to match: `axios-client.test.ts`, `error-messages.test.ts`, `home-screen.test.tsx`, `settings-about-section.test.tsx`, `settings-account-section.test.tsx`, `settings-screen.test.tsx`, `navigation-graph.test.tsx`

## Checks
- Typecheck: clean (`yarn workspace @meetio/mobile typecheck`)
- Unit tests: 1086 passing, 198 suites, 0 failing
- Lint: `npx eslint --max-warnings=0 apps/mobile` clean

## Acceptance criteria
- [x] Consent screen corrected: audio never leaves the phone; transcript goes to Meetio server + Gemini; retention-based deletion; link to full policy — proven by `consent-screen.test.tsx`
- [x] Gating switched to `consent_required` everywhere (`(tabs)/index.tsx`); a v1-consented user (`consent_required: true`) is routed to consent again — `home-screen.test.tsx`
- [x] Global 403 `CONSENT_REQUIRED` from any API call redirects to the consent screen (`axios-client.ts` response interceptor + `axios-client.test.ts`). No `POST /meetings` call site exists yet in this app (recording-live is still an explicit UI-only prototype per its own doc comment), so this is implemented as a general axios-level gate that will cover that endpoint the moment it lands, rather than a one-off hack tied to a call that doesn't exist.
- [x] Consent mutation already invalidated `ME_QUERY_KEY` on success (pre-existing, verified unchanged)
- [x] Privacy policy screen renders `docs/privacy-policy.md` content; `privacy-policy.test.ts` fails the build if the two drift (normalization documented in that file's doc comment)
- [x] Settings "Chính sách bảo mật" now opens it; consent screen also links to it
- [x] AI usage shown in Settings: budgeted vs unbudgeted copy, warning banner at ≥80% — `settings-usage-section.test.tsx`
- [x] Retention picker: fixed options (Không tự xóa/30/90/180/365), saved via `PATCH /users/me`, one-line deletion + 7-day-reminder explainer — `settings-retention-picker.test.tsx`

## Issues / judgment calls
1. **No `POST /meetings` call site exists in mobile yet** (recording-live.tsx is explicitly a UI-only prototype, per its own pre-existing doc comment — no real recording pipeline). Implemented the CONSENT_REQUIRED redirect as a global axios response-interceptor branch instead of wiring a specific screen, so it's real, tested, and will apply automatically once that endpoint is called from anywhere.
2. `expo-router`'s `router` is required lazily inside the interceptor (not statically imported) — a static import broke ~190 unrelated test suites that transitively import `axios-client.ts` without mocking `expo-router` (only the one test file that exercises this branch mocks it). Documented inline in `axios-client.ts`.
3. Retention control changed from a free-text number field to a fixed 5-option picker per the task's explicit spec; updated `settings-account-section.tsx`/its tests and `settings.tsx`'s local override state accordingly (button index shifted from 0/1 to 5/6 in the account-section test — updated with a comment).
4. `usage` (and pre-existing `notification_settings`) are read defensively (`meQuery.data.usage ? ... : null`) even though `GetMeResponse.usage` is typed required — same defensive posture the existing code already applies to `notification_settings`, in case an older/partial server payload arrives.
5. Privacy-policy screen and content module intentionally exclude the doc's H1 title (shown via `ScreenHeader` instead) and its internal "Cần bổ sung trước khi phát hành" callout (a note to whoever ships the policy, not end-user text) — both exclusions are documented in `privacy-policy.ts` and enforced by `privacy-policy.test.ts`.
