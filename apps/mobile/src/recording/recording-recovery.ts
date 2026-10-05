import type { MeetingListItem } from '@meetio/shared';
import { transitionMeeting } from '../api/recording';
import { getLocalMeeting, insertLocalMeeting, listLocalMeetings, type LocalMeeting } from '../queue/local-meetings';
import { recordOp } from '../queue/lifecycle-ops';
import { openQueueDb } from '../queue/queue-db';
import { countPending } from '../queue/segment-queue';
import { readRecordingPreferences } from './recording-preferences';
import { getRecordingRuntime } from './recording-runtime';
import { useRecordingStore } from './recording.store';

/**
 * US-15 — a meeting left unfinished: the app died mid-recording, or the user left while `end`
 * was still syncing, or it was recorded on this account from another device. Home lists them
 * with "Tiếp tục" / "Kết thúc".
 */
export interface UnfinishedMeeting {
  id: string;
  startedAt: number;
  /** `ending` = already ended locally, still syncing — nothing to decide. */
  state: 'recording' | 'paused' | 'ending';
  pending: number;
  /** Only on the server (no local queue on this device). */
  serverOnly: boolean;
  /** Recognition language it was started with. */
  language: string;
  /** Phase 09: language its lines are translated into, or null. Kept when the meeting is resumed here. */
  translateTo: string | null;
}

const fromLocal = async (m: LocalMeeting): Promise<UnfinishedMeeting> => ({
  id: m.id,
  startedAt: m.startedAt,
  state: m.status,
  pending: await countPending(await openQueueDb(), m.id),
  serverOnly: false,
  language: m.createBody.source_language,
  translateTo: m.createBody.translate_to ?? null,
});

/** Local meetings first (they hold unsynced text), then server ones this device knows nothing about. */
export async function listUnfinishedMeetings(ownerId: string, server: MeetingListItem[]): Promise<UnfinishedMeeting[]> {
  const activeId = useRecordingStore.getState().meetingId;
  const local = (await listLocalMeetings(await openQueueDb(), ownerId)).filter((m) => m.id !== activeId);
  const known = new Set([activeId, ...local.map((m) => m.id)]);
  const serverOnly = server
    .filter((m) => !known.has(m.id) && (m.status === 'recording' || m.status === 'paused'))
    .map<UnfinishedMeeting>((m) => ({
      id: m.id,
      startedAt: Date.parse(m.started_at ?? m.created_at),
      state: m.status === 'paused' ? 'paused' : 'recording',
      pending: 0,
      serverOnly: true,
      language: m.source_language,
      translateTo: m.translate_to,
    }));
  return [...(await Promise.all(local.map(fromLocal))), ...serverOnly];
}

/** Continue recording it on this device: adopt a server-only meeting into the local queue first. */
export async function resumeUnfinishedMeeting(meeting: UnfinishedMeeting, ownerId: string): Promise<void> {
  const db = await openQueueDb();
  if (meeting.serverOnly && !(await getLocalMeeting(db, meeting.id))) {
    const preferences = await readRecordingPreferences();
    await insertLocalMeeting(db, {
      id: meeting.id,
      ownerId,
      startedAt: meeting.startedAt,
      createBody: { source_language: meeting.language, translate_to: meeting.translateTo, audio_source: preferences.audioSource, recording_quality: preferences.quality },
      serverCreated: true,
      status: meeting.state === 'paused' ? 'paused' : 'recording',
      pausedAt: meeting.state === 'paused' ? Date.now() : null,
    });
  }
  await (await getRecordingRuntime()).session.resumeUnfinished(meeting.id);
}

/** End it now: locally (the worker syncs the rest, then sends `end`), or straight on the server. */
export async function endUnfinishedMeeting(meeting: UnfinishedMeeting): Promise<void> {
  if (meeting.serverOnly) {
    await transitionMeeting(meeting.id, 'end', { at: new Date().toISOString() });
    return;
  }
  await recordOp(await openQueueDb(), meeting.id, 'end', Date.now());
  (await getRecordingRuntime()).worker.kick();
}
