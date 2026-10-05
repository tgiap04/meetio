import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';

/**
 * `app/(app)/consent.tsx` with the real mutation hook and QueryClient (`consent-screen.test.tsx`
 * mocks the hook). Offline, accepting must show the error and stay put — and must not also leak
 * an unhandled promise rejection, which the dev overlay reports as
 * "Uncaught (in promise) AxiosError: Network Error".
 */
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: jest.fn() },
}));

const mockRecordConsent = jest.fn();
jest.mock('../../api/users', () => ({
  recordConsent: (...args: unknown[]) => mockRecordConsent(...args),
}));

jest.mock('../../notifications/push-registration', () => ({ unregisterCurrentPushToken: jest.fn() }));

import ConsentScreen from '../../../app/(app)/consent';

let client: QueryClient;
let renderer: TestRenderer.ReactTestRenderer | null = null;

async function renderScreen() {
  await act(async () => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <ConsentScreen />
      </QueryClientProvider>,
    );
  });
  return renderer!;
}

async function pressAgree(view: TestRenderer.ReactTestRenderer) {
  const button = view.root.find((node) => node.props.label === 'Tôi đồng ý' && typeof node.props.onPress === 'function');
  await act(async () => {
    button.props.onPress();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const texts = (view: TestRenderer.ReactTestRenderer) =>
  view.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children as string);

describe('(app)/consent screen', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    jest.clearAllMocks();
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity } } });
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    act(() => renderer?.unmount());
    renderer = null;
    client.clear();
  });

  it('offline: shows the error, stays on the screen, and leaves no unhandled rejection', async () => {
    mockRecordConsent.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const view = await renderScreen();

    await pressAgree(view);
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockBack).not.toHaveBeenCalled();
    expect(texts(view)).toContain('Không thể kết nối máy chủ. Kiểm tra kết nối mạng và thử lại.');
    expect(unhandled).toEqual([]);
  });
});
