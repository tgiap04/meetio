import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { putSegmentTranslation } from '../api/segment-translation';
import { translate } from '../../modules/mlkit-translate';
import { useTranslateSegment } from './use-translate-segment';

jest.mock('../api/segment-translation', () => ({ putSegmentTranslation: jest.fn() }));
jest.mock('../../modules/mlkit-translate', () => ({ translate: jest.fn(), TranslationUnavailableError: class extends Error {} }));
const mockTranslate = translate as jest.Mock;
const mockPut = putSegmentTranslation as jest.Mock;

let run: ReturnType<typeof useTranslateSegment>;
let queryClient: QueryClient;
const mounted: TestRenderer.ReactTestRenderer[] = [];

function mount(meeting: { source_language: string; translate_to: string | null } | undefined) {
  function Harness() {
    run = useTranslateSegment('m1', meeting);
    return null;
  }
  act(() => {
    mounted.push(
      TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      ),
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  jest.spyOn(queryClient, 'invalidateQueries');
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  queryClient.clear();
});

describe('useTranslateSegment', () => {
  it('translates on the device, PUTs the result, then refreshes the transcript', async () => {
    mount({ source_language: 'vi-VN', translate_to: 'en-US' });
    mockTranslate.mockResolvedValue(' hello ');
    mockPut.mockResolvedValue(undefined);
    await act(async () => run({ seq: 4, text: 'xin chào' }));
    expect(mockTranslate).toHaveBeenCalledWith('xin chào', 'vi-VN', 'en-US');
    expect(mockPut).toHaveBeenCalledWith(undefined, 'm1', 4, { translated_text: 'hello', translated_to: 'en-US' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['segments', 'm1'] });
  });

  it('never PUTs when the device cannot translate, and does not refresh', async () => {
    mount({ source_language: 'vi-VN', translate_to: 'en-US' });
    mockTranslate.mockRejectedValue(new Error('Model not downloaded'));
    await expect(act(async () => run({ seq: 4, text: 'x' }))).rejects.toThrow('Model not downloaded');
    expect(mockPut).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('refuses an empty translation', async () => {
    mount({ source_language: 'vi-VN', translate_to: 'en-US' });
    mockTranslate.mockResolvedValue('  ');
    await expect(act(async () => run({ seq: 1, text: 'x' }))).rejects.toThrow('Empty translation');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('refuses a meeting that does not translate', async () => {
    mount({ source_language: 'vi-VN', translate_to: null });
    await expect(act(async () => run({ seq: 1, text: 'x' }))).rejects.toThrow('does not translate');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('passes a failed PUT through so the row can show it', async () => {
    mount({ source_language: 'vi-VN', translate_to: 'en-US' });
    mockTranslate.mockResolvedValue('hello');
    mockPut.mockRejectedValue(new Error('Request failed with status code 404'));
    await expect(act(async () => run({ seq: 4, text: 'x' }))).rejects.toThrow('404');
  });
});
