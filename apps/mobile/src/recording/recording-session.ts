import type { TranscriptSegmentItem } from '@meetio/shared';
import type { SqlDb } from '../queue/queue-db';
import { getLocalMeeting, insertLocalMeeting, raiseLastSeq } from '../queue/local-meetings';
import { recordOp } from '../queue/lifecycle-ops';
import { enqueueSegment, pendingSegments, type NewSegment } from '../queue/segment-queue';
import type { Scheduler } from './restart-loop';
import type { RecognitionMode, SttEngine } from './stt-engine';
import { createRecognitionPipeline, type PipelineSettings, type RecognitionPipeline } from './recognition-pipeline';
import { resetRecordingStore, useRecordingStore, type LiveTranslation } from './recording.store';
import { mergeSavedLines, toLine } from './saved-lines';

export interface RecordingSettings extends PipelineSettings {
  ownerId: string;
  /** Decided at setup (screen 05); stored with the local meeting and reused on resume. */
  mode: RecognitionMode;
  /** Phase 09: translate each line into this language on the server (vi-VN / en-US); omitted or null = no translation. */
  translateTo?: string | null;
}

export interface RecordingSessionDeps {
  /** The recognition engine for a mode: on-device (expo-speech-recognition) or server (Phase 18). */
  engineFor: (mode: RecognitionMode) => SttEngine;
  /** What this device can do now — only for a resumed meeting with no stored mode (adopted from the server). Rejects when the device cannot tell. */
  resolveMode: () => Promise<RecognitionMode>;
  db: () => Promise<SqlDb>;
  worker: { kick(): void; setLive(meetingId: string | null): void };
  keepalive: { start(): Promise<void>; stop(): Promise<void> };
  loadServerSegments: (meetingId: string) => Promise<TranscriptSegmentItem[]>;
  now: () => number;
  schedule: Scheduler;
  newId: () => string;
}

/**
 * One recording at a time on this device: engine + restart loop + segment assembler + the on-disk
 * queue. Every button acts locally first (status and op written to SQLite in one transaction) and
 * syncs afterwards, so start / pause / resume / end all work offline (US-07, US-14).
 */
export function createRecordingSession(deps: RecordingSessionDeps) {
  const store = useRecordingStore;
  let pipeline: RecognitionPipeline | null = null;
  // Segment writes run strictly one after another, so seq order is utterance order. A segment the
  // disk refused stays in `unsaved` and is retried (in order) with the next write — never dropped.
  const SAVE_PROBLEM = 'Chưa lưu được đoạn vừa nhận diện vào bộ nhớ máy — Meetio sẽ thử lại.';
  let writes: Promise<void> = Promise.resolve();
  const unsaved: { meetingId: string; segment: NewSegment }[] = [];

  function persist(meetingId: string, segment: NewSegment) {
    unsaved.push({ meetingId, segment });
    drain();
  }

  /** Writes every unsaved segment in order, stopping at the first failure (kept for the next try). */
  function drain() {
    writes = writes.then(async () => {
      while (unsaved.length > 0) {
        const next = unsaved[0];
        try {
          const seq = await enqueueSegment(await deps.db(), next.meetingId, next.segment);
          unsaved.shift();
          store.setState((s) => ({
            lines: [...s.lines, toLine({ ...next.segment, seq })],
            problem: s.problem === SAVE_PROBLEM ? null : s.problem,
          }));
          deps.worker.kick();
        } catch {
          store.setState({ problem: SAVE_PROBLEM });
          return;
        }
      }
    });
  }

  function wire(meetingId: string, ownerId: string, startedAt: number, settings: PipelineSettings, mode: RecognitionMode) {
    pipeline?.dispose();
    pipeline = createRecognitionPipeline({
      engine: deps.engineFor(mode),
      mode,
      upload: { ownerId, meetingId },
      now: deps.now,
      schedule: deps.schedule,
      meetingStartedAt: startedAt,
      settings,
      onPartial: (partial) => store.setState({ partial }),
      onSegment: (segment) => persist(meetingId, segment),
      onProblem: (problem) => store.setState({ problem }),
      onVolume: (volume) => store.setState({ volume }),
    });
  }

  async function listen() {
    await deps.keepalive.start().catch(() => undefined); // no foreground service → still records in foreground
    pipeline?.listen();
  }

  /** Stops the mic and waits until every utterance heard so far is on disk. */
  async function silence() {
    await pipeline?.silence();
    store.setState({ partial: null, volume: 0 });
    await writes;
    if (unsaved.length > 0) {
      // One more try; still failing means the disk refuses writes — so would `end` itself. Keep the
      // text in memory and let the user retry rather than record an `end` that misses it.
      drain();
      await writes;
      if (unsaved.length > 0) throw new Error('Unsaved segments remain');
    }
  }

  return {
    async start(settings: RecordingSettings): Promise<string> {
      if (store.getState().phase !== 'idle') throw new Error('A recording is already in progress');
      const id = deps.newId();
      const startedAt = deps.now();
      const db = await deps.db();
      await insertLocalMeeting(db, {
        id,
        ownerId: settings.ownerId,
        startedAt,
        createBody: { source_language: settings.language, translate_to: settings.translateTo ?? null, audio_source: settings.audioSource, recording_quality: settings.quality },
        recognitionMode: settings.mode,
      });
      resetRecordingStore();
      store.setState({ phase: 'recording', meetingId: id, startedAt, quality: settings.quality });
      deps.worker.setLive(id);
      deps.worker.kick();
      wire(id, settings.ownerId, startedAt, settings, settings.mode);
      await listen();
      return id;
    },

    async pause() {
      const { phase, meetingId } = store.getState();
      if (phase !== 'recording' || !meetingId) return;
      const at = deps.now();
      await silence();
      await recordOp(await deps.db(), meetingId, 'pause', at);
      store.setState({ phase: 'paused', pausedAt: at });
      deps.worker.kick();
    },

    async resume() {
      const { phase, meetingId, pausedAt, pausedMs } = store.getState();
      if (phase !== 'paused' || !meetingId) return;
      const at = deps.now();
      await recordOp(await deps.db(), meetingId, 'resume', at);
      store.setState({ phase: 'recording', pausedAt: null, pausedMs: pausedMs + (pausedAt === null ? 0 : at - pausedAt) });
      deps.worker.kick();
      await listen();
    },

    /** US-16: local end is instant; the sync worker sends `end` once every segment is acked. */
    async end() {
      const { phase, meetingId, pausedAt, pausedMs } = store.getState();
      if ((phase !== 'recording' && phase !== 'paused') || !meetingId) return;
      const at = deps.now();
      await silence();
      pipeline?.dispose();
      pipeline = null;
      await recordOp(await deps.db(), meetingId, 'end', at);
      store.setState({ phase: 'ending', pausedAt: null, pausedMs: pausedMs + (pausedAt === null ? 0 : at - pausedAt) });
      deps.worker.kick();
      await deps.keepalive.stop().catch(() => undefined);
    },

    /**
     * US-15: continue a meeting this device was recording when the app died. Shows everything saved
     * (server copy wins on the same seq, local queue fills the rest), continues seqs after the highest,
     * and marks the time the app was dead as a gap.
     */
    async resumeUnfinished(meetingId: string) {
      if (store.getState().phase !== 'idle') return;
      const db = await deps.db();
      const local = await getLocalMeeting(db, meetingId);
      if (!local) throw new Error('No unfinished meeting to resume');
      const server = local.serverCreated ? await deps.loadServerSegments(meetingId).catch(() => []) : [];
      const lines = mergeSavedLines(await pendingSegments(db, meetingId, 1_000_000), server);
      if (server.length) await raiseLastSeq(db, meetingId, Math.max(...server.map((s) => s.seq)));

      // Translations the server already holds for the lines shown (an unfinished meeting resumed on this device).
      const translations: Record<number, LiveTranslation> = {};
      for (const s of server) {
        if (s.translated_text && s.translated_to) translations[s.seq] = { status: 'done', text: s.translated_text, to: s.translated_to };
      }

      resetRecordingStore();
      store.setState({
        translations,
        phase: local.status === 'ending' ? 'ending' : 'paused',
        meetingId,
        startedAt: local.startedAt,
        quality: local.createBody.recording_quality,
        pausedMs: local.pausedMs,
        pausedAt: local.status === 'paused' ? local.pausedAt : null,
        lines,
      });
      deps.worker.setLive(meetingId);
      deps.worker.kick();
      if (local.status === 'ending') return;

      const settings = { language: local.createBody.source_language, audioSource: local.createBody.audio_source, quality: local.createBody.recording_quality };
      // Resume in the mode it started in: a meeting recorded on-device must never silently move to the
      // server (NFR-02). If that mode is unavailable now, the engine reports the usual problem.
      wire(meetingId, local.ownerId, local.startedAt, settings, local.recognitionMode ?? (await deps.resolveMode()));
      if (local.status === 'paused') {
        await this.resume();
        return;
      }
      // Killed while recording: nothing was heard from the last segment until now.
      pipeline?.gap(Math.max(0, deps.now() - (local.startedAt + (lines.at(-1)?.endedAtMs ?? 0))));
      store.setState({ phase: 'recording' });
      await listen();
    },

    /** Called by the runtime once the worker reports the meeting fully synced and ended. */
    finish(meetingId: string) {
      if (store.getState().meetingId !== meetingId) return;
      deps.worker.setLive(null);
      resetRecordingStore();
      store.setState({ endedMeetingId: meetingId });
    },
  };
}

export type RecordingSession = ReturnType<typeof createRecordingSession>;
