import { jest } from '@jest/globals';
import type { Namespace } from 'socket.io';
import { MeetingRoomNotifier } from './meeting-room.notifier.js';

function fakeNamespace() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { namespace: { to } as unknown as Namespace, to, emit };
}

describe('MeetingRoomNotifier', () => {
  it('emits to the meeting room only', () => {
    const { namespace, to, emit } = fakeNamespace();
    const notifier = new MeetingRoomNotifier();
    notifier.attach(namespace);

    notifier.processingStatus({ meeting_id: 'm1', status: 'processing', step: 'chunk', progress: 0.2 });
    notifier.meetingReady({ meeting_id: 'm1' });

    expect(to.mock.calls).toEqual([['meeting:m1'], ['meeting:m1']]);
    expect(emit.mock.calls.map((c) => c[0])).toEqual(['processing_status', 'meeting_ready']);
  });

  it('is a no-op before the gateway attaches (e.g. a worker with no socket server)', () => {
    expect(() => new MeetingRoomNotifier().meetingReady({ meeting_id: 'm1' })).not.toThrow();
  });
});
