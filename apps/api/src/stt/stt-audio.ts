import { STT_AUDIO_MIME_TYPES } from '@meetio/shared';

/** The part of a multer memory-storage file this module reads (multer's own types are not a dependency). */
export interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
}

/** "audio/mp4; codecs=mp4a.40.2" → "audio/mp4", or null when it is not an accepted audio type. */
export function acceptedAudioMime(raw: string): string | null {
  const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  return (STT_AUDIO_MIME_TYPES as readonly string[]).includes(base) ? base : null;
}
