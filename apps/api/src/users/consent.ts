/**
 * The consent text the app shows before recording (NFR-01). Bump it whenever that text changes in
 * substance: everyone who accepted an older version is asked again before their next recording.
 * v2 (2026-09-27): says audio never leaves the phone and transcripts go to Google Gemini.
 */
export const CURRENT_CONSENT_VERSION = 2;

export const consentRequired = (acceptedVersion: number | null) => (acceptedVersion ?? 0) < CURRENT_CONSENT_VERSION;

/** At or above this share of the monthly budget the app warns (NFR-07). */
export const USAGE_WARNING_RATIO = 0.8;
