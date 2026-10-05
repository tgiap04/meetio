import { resetRecordingStore, setLiveTranslation, useRecordingStore } from './recording.store';

beforeEach(() => resetRecordingStore());

describe('live translations', () => {
  it('stores a translation by seq for the meeting being recorded', () => {
    useRecordingStore.setState({ meetingId: 'm1' });
    setLiveTranslation('m1', 3, { status: 'done', text: 'hello', to: 'en-US' });
    expect(useRecordingStore.getState().translations[3]).toEqual({ status: 'done', text: 'hello', to: 'en-US' });
  });

  it('ignores a translation for another meeting (a late event from a previous recording)', () => {
    useRecordingStore.setState({ meetingId: 'm2' });
    setLiveTranslation('m1', 3, { status: 'done', text: 'hello', to: 'en-US' });
    expect(useRecordingStore.getState().translations).toEqual({});
  });

  it('a later translation replaces an earlier failure, but a failure never replaces a translation', () => {
    useRecordingStore.setState({ meetingId: 'm1' });
    setLiveTranslation('m1', 1, { status: 'failed' });
    setLiveTranslation('m1', 1, { status: 'done', text: 'ok', to: 'en-US' });
    setLiveTranslation('m1', 1, { status: 'failed' });
    expect(useRecordingStore.getState().translations[1]).toEqual({ status: 'done', text: 'ok', to: 'en-US' });
  });

  it('is cleared with the rest of the session', () => {
    useRecordingStore.setState({ meetingId: 'm1' });
    setLiveTranslation('m1', 1, { status: 'failed' });
    resetRecordingStore();
    expect(useRecordingStore.getState().translations).toEqual({});
  });
});
