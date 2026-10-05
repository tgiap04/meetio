import type { MeetingListItem } from '@meetio/shared';
import { openNodeSqliteDb } from '../queue/test-support/node-sqlite-db';
import { getLocalMeeting, insertLocalMeeting } from '../queue/local-meetings';

const mockDb = openNodeSqliteDb();
const mockResume = jest.fn(async () => undefined);
jest.mock('../queue/queue-db', () => ({ ...jest.requireActual('../queue/queue-db'), openQueueDb: async () => mockDb }));
jest.mock('./recording-runtime', () => ({ getRecordingRuntime: async () => ({ session: { resumeUnfinished: mockResume }, worker: { kick: jest.fn() } }) }));
jest.mock('../api/recording', () => ({ transitionMeeting: jest.fn() }));

import { listUnfinishedMeetings, resumeUnfinishedMeeting } from './recording-recovery';
import { writeRecordingPreferences } from './recording-preferences';

const serverMeeting = (translate_to: string | null): MeetingListItem => ({
  id: 'srv-1',
  title: 't',
  status: 'recording',
  source_language: 'vi-VN',
  translate_to,
  started_at: '2026-10-05T01:00:00.000Z',
  ended_at: null,
  duration_sec: null,
  created_at: '2026-10-05T01:00:00.000Z',
});

describe('recording recovery keeps translation (Phase 09)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the translation language of server-only and local unfinished meetings', async () => {
    await insertLocalMeeting(mockDb, {
      id: 'loc-1',
      ownerId: 'u1',
      startedAt: 1,
      createBody: { source_language: 'vi-VN', translate_to: 'en-US', audio_source: 'device_mic', recording_quality: 'high' },
    });
    const listed = await listUnfinishedMeetings('u1', [serverMeeting('en-US')]);
    expect(listed.map((m) => [m.id, m.translateTo])).toEqual([
      ['loc-1', 'en-US'],
      ['srv-1', 'en-US'],
    ]);
  });

  it('adopting a server-only meeting keeps its translation language, not today’s preference', async () => {
    await writeRecordingPreferences({ audioSource: 'device_mic', quality: 'high', language: 'vi-VN', translateTo: null });
    const [meeting] = (await listUnfinishedMeetings('u1', [serverMeeting('en-US')])).filter((m) => m.serverOnly);
    await resumeUnfinishedMeeting(meeting, 'u1');
    expect((await getLocalMeeting(mockDb, 'srv-1'))?.createBody.translate_to).toBe('en-US');
    expect(mockResume).toHaveBeenCalledWith('srv-1');
  });
});
