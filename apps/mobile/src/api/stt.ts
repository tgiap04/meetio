import { isAxiosError } from 'axios';
import { STT_LANGUAGES, type SttLanguage, type TranscribeAudioResponse } from '@meetio/shared';
import { apiClient } from './axios-client';
import { getMe } from './users';

/**
 * Server-side speech recognition (docs/api-spec.md — POST /stt/transcribe), used only when the
 * phone cannot recognise speech on-device. One call = one ~10s audio chunk. The audio is not
 * stored server-side, and the returned text is never logged here.
 */
const UPLOAD_TIMEOUT_MS = 30_000;
const CHUNK_FILE_NAME = 'chunk.m4a';
const CHUNK_MIME_TYPE = 'audio/mp4';

const isSttLanguage = (value: string): value is SttLanguage => (STT_LANGUAGES as readonly string[]).includes(value);

/**
 * Uploads the recorded chunk at `uri` and returns its transcript ('' = no speech). Rejects on any
 * failure (network, `OwnerMismatchError`, 403 CONSENT_REQUIRED, 429, 503, malformed response) — the caller turns that
 * into a gap in the transcript.
 */
export async function transcribeAudioChunk(
  uri: string,
  language: string,
  /** `ownerId`: the user who recorded it — refused client-side if another user is signed in. */
  meeting: { ownerId: string; meetingId: string },
): Promise<string> {
  if (!isSttLanguage(language)) throw new Error(`Unsupported recognition language: ${language}`);
  const form = new FormData();
  // React Native's FormData streams a file from `{ uri, name, type }`; the DOM typings don't know it.
  form.append('audio', { uri, name: CHUNK_FILE_NAME, type: CHUNK_MIME_TYPE } as unknown as Blob);
  form.append('language', language);
  form.append('meeting_id', meeting.meetingId);
  const { data } = await apiClient.post<TranscribeAudioResponse>('/stt/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
    expectedOwnerId: meeting.ownerId,
  });
  if (typeof data?.text !== 'string') throw new Error('Malformed /stt/transcribe response');
  return data.text;
}

/**
 * Server mode cannot start without a network. There is no NetInfo in the app, so ask the API
 * something light and authenticated. Only "no response at all" counts as offline: any HTTP
 * answer (even an error) proves the server is reachable, and real errors surface on their own.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    await getMe();
    return true;
  } catch (error) {
    return !(isAxiosError(error) && !error.response);
  }
}
