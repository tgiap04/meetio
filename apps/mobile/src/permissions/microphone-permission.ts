/**
 * Microphone permission wrapper.
 *
 * Screens never import `expo-audio` or `expo-linking` directly — they import
 * only the four names exported here. That keeps the raw `PermissionResponse`
 * shape (and the choice of native module) contained to this one file; see
 * decisions.md §4 for the state table this was derived from.
 */
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { openSettings } from 'expo-linking';

export type MicPermissionView = 'ask' | 'blocked' | 'granted';

/**
 * The views the permission screen actually renders.
 *
 * `granted` never reaches the UI: the moment it is resolved the screen marks the
 * prompt seen and replaces to the root, so nothing renders for it. Keeping it out
 * of the rendered type stops the screen carrying a branch that can never run.
 */
export type AskOrBlockedView = Exclude<MicPermissionView, 'granted'>;

export interface MicPermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Pure state-table lookup — no imports, no I/O. See decisions.md §4:
 * granted always wins; otherwise `canAskAgain` decides between offering the
 * system dialog again ("ask") or sending the user to Settings ("blocked").
 */
export function resolveMicPermissionView(snapshot: MicPermissionSnapshot): MicPermissionView {
  if (snapshot.granted) {
    return 'granted';
  }
  return snapshot.canAskAgain ? 'ask' : 'blocked';
}

function toSnapshot(response: {
  granted: boolean;
  canAskAgain: boolean;
}): MicPermissionSnapshot {
  return { granted: response.granted, canAskAgain: response.canAskAgain };
}

/** Triggers the system permission dialog (a no-op resolve if it can't be shown again). */
export async function requestMicrophonePermission(): Promise<MicPermissionSnapshot> {
  const response = await requestRecordingPermissionsAsync();
  return toSnapshot(response);
}

/** Reads the current permission state without prompting. */
export async function readMicrophonePermission(): Promise<MicPermissionSnapshot> {
  const response = await getRecordingPermissionsAsync();
  return toSnapshot(response);
}

/** Deep-links to this app's page in the OS Settings app. */
export async function openAppSettings(): Promise<void> {
  await openSettings();
}
