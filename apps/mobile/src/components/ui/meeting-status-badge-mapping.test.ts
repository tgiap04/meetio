import { MeetingStatus } from '@meetio/shared';
import { toStatusBadgeStatus } from './meeting-status-badge-mapping';

describe('toStatusBadgeStatus', () => {
  it('maps ready to done', () => {
    expect(toStatusBadgeStatus(MeetingStatus.READY)).toBe('done');
  });

  it('maps processing to processing', () => {
    expect(toStatusBadgeStatus(MeetingStatus.PROCESSING)).toBe('processing');
  });

  it('maps failed to failed', () => {
    expect(toStatusBadgeStatus(MeetingStatus.FAILED)).toBe('failed');
  });

  it.each([MeetingStatus.QUEUED, MeetingStatus.RECORDING, MeetingStatus.PAUSED, MeetingStatus.ENDED])(
    'maps pre-pipeline status %s to queued',
    (status) => {
      expect(toStatusBadgeStatus(status)).toBe('queued');
    },
  );
});
