import { ApiErrorCode } from '@meetio/shared';
import { MeetingStatus } from '../database/enums/meeting-status.enum.js';
import { acceptsSegments, transition, type MeetingAction } from './meeting-state-machine.js';
import { InvalidStateTransitionException } from './invalid-state-transition.exception.js';

const S = MeetingStatus;

// The whole legal-move table, written out independently of the implementation.
// Every (status, action) pair not listed here must be rejected with 409.
const LEGAL: Record<string, MeetingStatus> = {
  'recording:pause': S.PAUSED,
  'paused:resume': S.RECORDING,
  'recording:end': S.ENDED,
  'paused:end': S.ENDED,
  'ended:enqueue': S.QUEUED,
  'queued:start_processing': S.PROCESSING,
  'processing:complete': S.READY,
  'processing:fail': S.FAILED,
  'failed:requeue': S.QUEUED,
  'ready:requeue': S.QUEUED,
};

const ACTIONS: MeetingAction[] = ['pause', 'resume', 'end', 'enqueue', 'start_processing', 'complete', 'fail', 'requeue'];

describe('meeting state machine', () => {
  for (const status of Object.values(S)) {
    for (const action of ACTIONS) {
      const expected = LEGAL[`${status}:${action}`];
      if (expected) {
        it(`${status} --${action}--> ${expected}`, () => {
          expect(transition(status, action)).toBe(expected);
        });
      } else {
        it(`${status} --${action}--> 409`, () => {
          expect(() => transition(status, action)).toThrow(InvalidStateTransitionException);
        });
      }
    }
  }

  it('reports the code and the offending move in the error body', () => {
    try {
      transition(S.ENDED, 'end');
      throw new Error('expected a throw');
    } catch (error) {
      const body = (error as InvalidStateTransitionException).getResponse() as Record<string, unknown>;
      expect((error as InvalidStateTransitionException).getStatus()).toBe(409);
      expect(body.code).toBe(ApiErrorCode.INVALID_STATE_TRANSITION);
      expect(body.details).toEqual({ from: 'ended', action: 'end' });
    }
  });

  it('accepts segments until the pipeline starts reading the transcript', () => {
    const accepting = Object.values(S).filter(acceptsSegments);
    expect(accepting.sort()).toEqual([S.ENDED, S.PAUSED, S.QUEUED, S.RECORDING].sort());
  });
});
