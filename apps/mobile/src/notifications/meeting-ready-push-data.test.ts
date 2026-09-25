import { isMeetingReadyPushData } from './meeting-ready-push-data';

describe('isMeetingReadyPushData', () => {
  it('accepts a well-formed payload', () => {
    expect(isMeetingReadyPushData({ type: 'meeting_ready', meeting_id: 'm1' })).toBe(true);
  });

  it('rejects a different notification type', () => {
    expect(isMeetingReadyPushData({ type: 'something_else', meeting_id: 'm1' })).toBe(false);
  });

  it('rejects a payload missing meeting_id', () => {
    expect(isMeetingReadyPushData({ type: 'meeting_ready' })).toBe(false);
  });

  it('rejects null, undefined, and non-object values', () => {
    expect(isMeetingReadyPushData(null)).toBe(false);
    expect(isMeetingReadyPushData(undefined)).toBe(false);
    expect(isMeetingReadyPushData('meeting_ready')).toBe(false);
  });
});
