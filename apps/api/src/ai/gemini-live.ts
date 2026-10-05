import { AudioTranscriptionConfigMode, Modality, type Live } from '@google/genai';
import { STT_STREAM_MIME_TYPE, type SttLanguage } from '@meetio/shared';
import { AiServiceUnavailableError } from './ai-errors.js';
import type { GeminiKeyPool } from './gemini-key-pool.js';

/** The slice of `@google/genai`'s `ai.live` used here — injectable so tests need no network. */
export type LiveApi = Pick<Live, 'connect'>;

export interface LiveHandlers {
  /** Low-latency partial text for the stretch being spoken (replaces the previous partial). */
  onInterim(text: string): void;
  /** A settled stretch of speech. */
  onFinal(text: string): void;
  /** Gemini announced it will end the session soon (the 10-minute cap) — a cue to rotate early. */
  onGoAway(): void;
  /** The socket closed; `failure` is false for a close this side asked for or a clean one. */
  onClose(failure: boolean): void;
}

/** One open Live transcription session. Audio goes out as base64 PCM16 16 kHz and is never kept here. */
export interface LiveSession {
  sendAudio(pcm: Buffer): void;
  /** Tells Gemini the audio ended so it settles what it has heard. */
  endAudio(): void;
  close(): void;
}

export interface LiveOpener {
  isConfigured(): boolean;
  /** Opens one session on the next usable key. Rejects with AiServiceUnavailableError. */
  open(language: SttLanguage, handlers: LiveHandlers): Promise<LiveSession>;
  readonly model: string;
}

const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;
const isInvalidKey = (error: unknown) => statusOf(error) === 400 && /API_KEY_INVALID|API key not valid/i.test(String((error as Error)?.message));

/**
 * Opens Gemini Live transcription sessions through the same key pool rules as the REST calls: a
 * session is pinned to one key for its lifetime, 429 rests that key and tries the next, an invalid
 * key is dropped. Transcript text is relayed to the handlers and never logged (NFR-04).
 */
export class GeminiLiveClient implements LiveOpener {
  constructor(
    private readonly pool: GeminiKeyPool<LiveApi> | null,
    private readonly options: { model: string; /** Default 10 s: the SDK's connect() never settles when the socket fails before opening. */ connectTimeoutMs?: number },
  ) {}

  get model(): string {
    return this.options.model;
  }

  isConfigured(): boolean {
    return this.pool !== null;
  }

  async open(language: SttLanguage, handlers: LiveHandlers): Promise<LiveSession> {
    const pool = this.pool;
    if (!pool) throw new AiServiceUnavailableError('Chưa cấu hình GEMINI_API_KEY');
    for (let attempt = 0; attempt < pool.size; attempt++) {
      const slot = pool.acquire();
      if (!slot) break;
      try {
        return await this.connect(slot.client, language, handlers);
      } catch (error) {
        if (statusOf(error) === 429) pool.rest(slot, error);
        else if (isInvalidKey(error)) pool.disable(slot);
        else throw new AiServiceUnavailableError(`Không mở được phiên Gemini Live${statusOf(error) ? ` (HTTP ${statusOf(error)})` : ''}`);
      }
    }
    throw new AiServiceUnavailableError('Mọi khóa Gemini đều đang tạm nghỉ hoặc không hợp lệ');
  }

  private async connect(api: LiveApi, language: SttLanguage, handlers: LiveHandlers): Promise<LiveSession> {
    let closedByUs = false;
    let opened = false;
    let failEarly!: (error: Error) => void;
    const early = new Promise<never>((_, reject) => (failEarly = reject));
    early.catch(() => undefined); // handled by the race below; this only silences a rejection nobody awaits
    const timer = setTimeout(() => failEarly(new Error('Live connect timed out')), this.options.connectTimeoutMs ?? 10_000);
    const connecting = api.connect({
      model: this.options.model,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: { languageCodes: [language], mode: AudioTranscriptionConfigMode.VERBATIM },
      },
      callbacks: {
        onmessage: (message) => {
          const content = message.serverContent;
          if (content?.interimInputTranscription?.text) handlers.onInterim(content.interimInputTranscription.text);
          if (content?.inputTranscription?.text) handlers.onFinal(content.inputTranscription.text);
          if (message.goAway) handlers.onGoAway();
        },
        // After open a socket error is always followed by onclose, which carries the outcome.
        onerror: () => {
          if (!opened) failEarly(new Error('Live socket error before open'));
        },
        onclose: (event) => {
          if (!opened) failEarly(new Error('Live socket closed before open'));
          else handlers.onClose(!closedByUs && event?.code !== 1000);
        },
      },
    });
    let session: Awaited<typeof connecting>;
    try {
      session = await Promise.race([connecting, early]);
    } catch (error) {
      // A connect that settles after we gave up must not leave a socket behind.
      closedByUs = true;
      connecting.then((late) => late.close(), () => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
    opened = true;
    return {
      sendAudio: (pcm) => session.sendRealtimeInput({ audio: { data: pcm.toString('base64'), mimeType: STT_STREAM_MIME_TYPE } }),
      endAudio: () => session.sendRealtimeInput({ audioStreamEnd: true }),
      close: () => {
        closedByUs = true;
        session.close();
      },
    };
  }
}
