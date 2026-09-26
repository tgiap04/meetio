import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import type { MeetingActionsResponse } from '../api/actions';
import { getMeetingActions } from '../api/actions';
import { useMeetingActionsQuery } from './use-meeting-actions-query';

jest.mock('../api/actions', () => ({
  getMeetingActions: jest.fn(),
}));

const mockedGetMeetingActions = getMeetingActions as jest.Mock;

function Probe({ id, onValue }: { id: string | undefined; onValue: (v: UseQueryResult<MeetingActionsResponse>) => void }) {
  onValue(useMeetingActionsQuery(id));
  return null;
}

let activeRenderer: TestRenderer.ReactTestRenderer | undefined;

function render(id: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest!: UseQueryResult<MeetingActionsResponse>;
  act(() => {
    activeRenderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe id={id} onValue={(value) => (latest = value)} />
      </QueryClientProvider>,
    );
  });
  return () => latest;
}

async function flush(getLatest: () => { isSuccess: boolean; isError: boolean }, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const latest = getLatest();
    if (latest.isSuccess || latest.isError) {
      return;
    }
  }
}

describe('useMeetingActionsQuery', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => activeRenderer?.unmount());
    activeRenderer = undefined;
  });

  it('fetches the meeting actions when an id is present', async () => {
    mockedGetMeetingActions.mockResolvedValue({ items: [{ id: 'a1' }] });
    const getLatest = render('m1');
    await flush(getLatest);
    expect(mockedGetMeetingActions).toHaveBeenCalledWith('m1');
    expect(getLatest().data).toEqual({ items: [{ id: 'a1' }] });
  });

  it('does not fetch when no id is given', async () => {
    const getLatest = render(undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(getLatest().isPending).toBe(true);
    expect(mockedGetMeetingActions).not.toHaveBeenCalled();
  });

  it('surfaces a rejected request as isError', async () => {
    mockedGetMeetingActions.mockRejectedValue(new Error('boom'));
    const getLatest = render('m1');
    await flush(getLatest);
    expect(getLatest().isError).toBe(true);
  });
});
