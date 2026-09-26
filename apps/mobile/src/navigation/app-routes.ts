/**
 * Every route constant under the `(app)` group that phases 03–12 (the screen
 * phases) navigate to, in one place. Kept separate from `route-guards.ts` —
 * that file owns the bootstrap/auth-gate literals (`APP_HOME_ROUTE`,
 * `LOGIN_ROUTE`, etc.), this one owns the in-app destinations a screen
 * reaches by tapping something.
 *
 * Screen phases import from here rather than typing route strings inline, so
 * a route rename is a one-file change instead of a grep-and-replace.
 */

// --- Tabs (P03/P10/P11/P12) -------------------------------------------------
export const TAB_HOME_ROUTE = '/(app)/(tabs)';
export const TAB_LIBRARY_ROUTE = '/(app)/(tabs)/library';
export const TAB_SEARCH_ROUTE = '/(app)/(tabs)/search';
export const TAB_SETTINGS_ROUTE = '/(app)/(tabs)/settings';

// --- Recording flow (P04/P05/P06) ------------------------------------------
export const RECORDING_SETUP_ROUTE = '/(app)/recording-setup';
export const RECORDING_LIVE_ROUTE = '/(app)/recording-live';
export const RECORDING_DONE_ROUTE = '/(app)/recording-done';

// --- Meeting detail and its sub-screens (P07/P08/P09) -----------------------
export const MEETING_DETAIL_ROUTE = '/(app)/meeting-detail';
export const MEETING_TRANSCRIPT_ROUTE = '/(app)/meeting-transcript';
export const MEETING_GRAPH_ROUTE = '/(app)/meeting-graph';

// --- Knowledge graph (P13) ---------------------------------------------------
// Flat `?id=`-param screens, same convention as meeting-detail/-transcript
// above, rather than an Expo Router dynamic `[id]` segment.
export const ENTITIES_LIST_ROUTE = '/(app)/entities';
export const ENTITY_DETAIL_ROUTE = '/(app)/entity-detail';
export const MERGE_SUGGESTIONS_ROUTE = '/(app)/merge-suggestions';

// --- Cross-meeting action items (Phase 14) ----------------------------------
export const ACTIONS_ROUTE = '/(app)/actions';

// --- GraphRAG Q&A chat (Phase 15) --------------------------------------------
export const MEETING_CHAT_ROUTE = '/(app)/meeting-chat';
export const ASK_ROUTE = '/(app)/ask';

// --- Existing stacked screens (unchanged, listed for discoverability) ------
// `PERMISSION_ROUTE` was dropped here by P13's tap audit: the mic-permission
// screen is reached exclusively through the boot resolver's own
// `MIC_PERMISSION_ROUTE` (route-guards.ts), never by a screen tapping
// something, so a second, unused constant for the same path was dead code —
// caught by navigation-graph.test.tsx's dead-route check.
export const CONSENT_ROUTE = '/(app)/consent';

// --- Privacy policy (Phase 16, NFR-01) --------------------------------------
// Opened from the Settings "Chính sách bảo mật" row and from the consent
// screen's "Đọc chính sách đầy đủ" link.
export const PRIVACY_POLICY_ROUTE = '/(app)/privacy-policy';
