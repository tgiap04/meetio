import { jest } from '@jest/globals';
import { GeminiClient, type GenAiModels } from './gemini.client.js';
import { GeminiCallRunner } from './gemini-call-runner.js';
import { GeminiKeyPool } from './gemini-key-pool.js';
import { AiServiceUnavailableError, QuotaExceededError } from './ai-errors.js';
import type { UsageEntry, UsageTracker } from './usage-tracker.js';

const OPTIONS = { textModel: 'gemini-text', embeddingModel: 'gemini-embed', dimensions: 3 };
const who = { userId: 'u1', meetingId: 'm1' };

function setup(models: Partial<GenAiModels>) {
  const recorded: UsageEntry[] = [];
  const usage = {
    assertWithinBudget: jest.fn(async () => undefined),
    record: jest.fn(async (e: UsageEntry) => void recorded.push(e)),
  };
  const runner = new GeminiCallRunner(new GeminiKeyPool([models as GenAiModels], { defaultCooldownMs: 1000 }), {
    maxConcurrency: 4,
    retries: 1,
    retryBaseMs: 1,
    log: () => undefined,
  });
  return { client: new GeminiClient(runner, usage as unknown as UsageTracker, OPTIONS), usage, recorded };
}

describe('GeminiClient', () => {
  it('generateText records one usage row with the reported tokens', async () => {
    const t = setup({ generateContent: async () => ({ text: 'kết quả', usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 } }) });
    await expect(t.client.generateText({ ...who, operation: 'summarize', prompt: 'p' })).resolves.toEqual({ text: 'kết quả', inputTokens: 120, outputTokens: 30 });
    expect(t.recorded).toEqual([{ ...who, operation: 'summarize', model: 'gemini-text', inputTokens: 120, outputTokens: 30 }]);
  });

  it('embed counts each text with countTokens, records the real total, and returns unit vectors', async () => {
    const t = setup({
      countTokens: async ({ contents }) => ({ totalTokens: contents.length }),
      embedContent: async ({ contents, config }) => {
        expect(config).toMatchObject({ outputDimensionality: 3, taskType: 'RETRIEVAL_DOCUMENT' });
        return { embeddings: contents.map(() => ({ values: [3, 0, 4] })) };
      },
    });
    const out = await t.client.embed({ ...who, operation: 'embed', texts: ['abcd', 'ab'], taskType: 'RETRIEVAL_DOCUMENT' });
    expect(out.tokenCounts).toEqual([4, 2]);
    expect(out.vectors).toEqual([[0.6, 0, 0.8], [0.6, 0, 0.8]]);
    expect(t.recorded).toEqual([{ ...who, operation: 'embed', model: 'gemini-embed', inputTokens: 6, outputTokens: 0 }]);
  });

  it('refuses a wrong-sized embedding response instead of storing garbage, but still accounts the call', async () => {
    const t = setup({ countTokens: async () => ({ totalTokens: 1 }), embedContent: async () => ({ embeddings: [{ values: [1, 2] }] }) });
    await expect(t.client.embed({ ...who, operation: 'embed', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(AiServiceUnavailableError);
    // the call was made (and billed), so its real token count is still accounted
    expect(t.recorded).toEqual([{ ...who, operation: 'embed', model: 'gemini-embed', inputTokens: 1, outputTokens: 0 }]);
  });

  it('never records a made-up count when countTokens gives none', async () => {
    const t = setup({ countTokens: async () => ({}), embedContent: async () => ({ embeddings: [{ values: [1, 0, 0] }] }) });
    await expect(t.client.embed({ ...who, operation: 'embed', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toThrow(/countTokens/);
    expect(t.recorded).toEqual([]);
  });

  it('checks the budget before any call', async () => {
    const generateContent = jest.fn(async () => ({ text: 'x' }));
    const t = setup({ generateContent });
    t.usage.assertWithinBudget.mockRejectedValue(new QuotaExceededError(10, 10));
    await expect(t.client.generateText({ ...who, operation: 'x', prompt: 'p' })).rejects.toBeInstanceOf(QuotaExceededError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('fails clearly without any configured key', async () => {
    const client = new GeminiClient(null, {} as UsageTracker, OPTIONS);
    expect(client.isConfigured()).toBe(false);
    await expect(client.embed({ ...who, operation: 'e', texts: ['a'], taskType: 'RETRIEVAL_QUERY' })).rejects.toBeInstanceOf(AiServiceUnavailableError);
  });
  describe('transcribeAudio', () => {
    const audio = Buffer.from('fake-aac-bytes');
    const request = { userId: 'u1', meetingId: 'm1', audio, mimeType: 'audio/mp4', language: 'vi-VN' as const };

    it('sends the audio as base64 inlineData with the language in the prompt, records usage "stt", and trims the text', async () => {
      const generateContent = jest.fn(async (_p: Parameters<GenAiModels['generateContent']>[0]) => ({
        text: '  xin chào các bạn \n',
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 12 },
      }));
      const t = setup({ generateContent });
      await expect(t.client.transcribeAudio(request)).resolves.toEqual({ text: 'xin chào các bạn', inputTokens: 300, outputTokens: 12 });

      const params = generateContent.mock.calls[0][0];
      expect(params.model).toBe('gemini-text');
      expect(params.contents).toEqual([
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'audio/mp4', data: audio.toString('base64') } }, { text: expect.stringContaining('vi-VN') }],
        },
      ]);
      expect(t.recorded).toEqual([{ userId: 'u1', meetingId: 'm1', operation: 'stt', model: 'gemini-text', inputTokens: 300, outputTokens: 12 }]);
    });

    it('returns an empty string when Gemini hears no speech', async () => {
      const t = setup({ generateContent: async () => ({ usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0 } }) });
      await expect(t.client.transcribeAudio({ ...request, meetingId: null, language: 'en-US' })).resolves.toMatchObject({ text: '' });
      expect(t.recorded[0]).toMatchObject({ meetingId: null, operation: 'stt' });
    });

    it('checks the budget before calling Gemini', async () => {
      const generateContent = jest.fn(async () => ({ text: 'x' }));
      const t = setup({ generateContent });
      t.usage.assertWithinBudget.mockRejectedValue(new QuotaExceededError(10, 10));
      await expect(t.client.transcribeAudio(request)).rejects.toBeInstanceOf(QuotaExceededError);
      expect(generateContent).not.toHaveBeenCalled();
      expect(t.recorded).toEqual([]);
    });

    it('fails with AI_SERVICE_UNAVAILABLE when no key is configured', async () => {
      const client = new GeminiClient(null, {} as UsageTracker, OPTIONS);
      await expect(client.transcribeAudio(request)).rejects.toBeInstanceOf(AiServiceUnavailableError);
    });
  });
});
