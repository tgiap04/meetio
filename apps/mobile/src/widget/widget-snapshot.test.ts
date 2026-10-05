import { MeetingStatus, type MeetingListItem } from '@meetio/shared';
import {
  SIGNED_OUT_SNAPSHOT,
  buildWidgetSnapshot,
  parseWidgetSnapshot,
  sameWidgetContent,
} from './widget-snapshot';

const meeting: MeetingListItem = {
  id: 'm1',
  title: 'Họp kế hoạch quý 4',
  status: MeetingStatus.READY,
  source_language: 'vi-VN',
  translate_to: null,
  started_at: null,
  ended_at: null,
  duration_sec: 600,
  created_at: '2026-10-05T00:00:00Z',
};

const base = { latestMeeting: meeting, openActions: 3, recordingPhase: 'idle' as const, appLockEnabled: false, now: 5 };

describe('buildWidgetSnapshot', () => {
  it('carries the latest meeting and the open to-do count', () => {
    expect(buildWidgetSnapshot(base)).toEqual({
      v: 1,
      signedIn: true,
      recording: false,
      openActions: 3,
      lastMeeting: { id: 'm1', title: 'Họp kế hoạch quý 4', status: 'ready' },
      updatedAt: 5,
    });
  });

  it('hides the meeting title when the app lock is on', () => {
    expect(buildWidgetSnapshot({ ...base, appLockEnabled: true }).lastMeeting).toEqual({
      id: 'm1',
      title: null,
      status: 'ready',
    });
  });

  it.each(['recording', 'paused'] as const)('reports recording while the session is %s', (phase) => {
    expect(buildWidgetSnapshot({ ...base, recordingPhase: phase }).recording).toBe(true);
  });

  it('does not report recording while ending or idle', () => {
    expect(buildWidgetSnapshot({ ...base, recordingPhase: 'ending' }).recording).toBe(false);
  });

  it('keeps unknowns as null rather than inventing zeros', () => {
    const snap = buildWidgetSnapshot({ ...base, latestMeeting: undefined, openActions: undefined });
    expect(snap.lastMeeting).toBeNull();
    expect(snap.openActions).toBeNull();
  });
});

describe('parseWidgetSnapshot', () => {
  it('round-trips a built snapshot', () => {
    const snap = buildWidgetSnapshot(base);
    expect(parseWidgetSnapshot(JSON.stringify(snap))).toEqual(snap);
  });

  it.each([null, '', '{not json', '{"v":2,"signedIn":true}', '{"v":1}'])('reads %p as signed out', (raw) => {
    expect(parseWidgetSnapshot(raw)).toEqual(SIGNED_OUT_SNAPSHOT);
  });
});

describe('sameWidgetContent', () => {
  it('ignores the timestamp but not the content', () => {
    const a = buildWidgetSnapshot(base);
    expect(sameWidgetContent(a, { ...a, updatedAt: 99 })).toBe(true);
    expect(sameWidgetContent(a, { ...a, openActions: 4 })).toBe(false);
  });
});
