/**
 * The consent text the app shows before recording (NFR-01). Bump it whenever that text changes in
 * substance: everyone who accepted an older version is asked again before their next recording.
 * v2 (2026-09-27): says audio never leaves the phone and transcripts go to Google Gemini.
 * v3 (never released, folded into v4): on a phone without on-device recognition, audio is sent to
 * the Meetio server and Google Gemini to be transcribed, and is not stored.
 * v4 (2026-10-05): includes v3's disclosure and states that the Gemini API free tier is in use, so
 * Google may use submitted content (transcript text, and audio in server-recognition mode) to
 * improve its products.
 */
export const CURRENT_CONSENT_VERSION = 4;

export const consentRequired = (acceptedVersion: number | null) => (acceptedVersion ?? 0) < CURRENT_CONSENT_VERSION;

/** At or above this share of the monthly budget the app warns (NFR-07). */
export const USAGE_WARNING_RATIO = 0.8;
