import { fakeEmbedding } from '../../test-support/fake-embedding.js';
import { GeminiClient, type GenAiModels } from '../../ai/gemini.client.js';
import { GeminiCallRunner } from '../../ai/gemini-call-runner.js';
import { GeminiKeyPool } from '../../ai/gemini-key-pool.js';
import { UsageTracker } from '../../ai/usage-tracker.js';
import type { DataSource } from 'typeorm';

/** A deterministic stand-in for Gemini's SDK models: real GeminiClient + runner + usage accounting, no network. */
export function fakeGemini(
  db: DataSource,
  calls = { embed: 0, count: 0, generate: 0 },
  generate: (prompt: string, systemInstruction?: string) => string = () => '',
) {
  const models: GenAiModels = {
    generateContent: async ({ contents, config }) => {
      calls.generate++;
      return { text: generate(contents, config?.systemInstruction), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
    },
    countTokens: async ({ contents }) => {
      calls.count++;
      return { totalTokens: contents.split(/\s+/).filter(Boolean).length };
    },
    embedContent: async ({ contents }) => {
      calls.embed++;
      return { embeddings: contents.map((c) => ({ values: fakeEmbedding(c) })) };
    },
  };
  const runner = new GeminiCallRunner(new GeminiKeyPool([models], { defaultCooldownMs: 1000 }), {
    maxConcurrency: 4,
    retries: 0,
    retryBaseMs: 1,
    log: () => undefined,
  });
  return { client: new GeminiClient(runner, new UsageTracker(db), { textModel: 't', embeddingModel: 'fake-embed', dimensions: 768 }), calls };
}

export { fakeEmbedding };
