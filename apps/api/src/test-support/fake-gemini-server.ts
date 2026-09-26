import { createServer, type Server } from 'node:http';
import { fakeEmbedding } from './fake-embedding.js';

export interface GeminiCall {
  key: string;
  method: 'batchEmbedContents' | 'countTokens' | 'generateContent' | 'other';
  model: string;
}

const textsOf = (body: { contents?: { parts?: { text?: string }[] }[]; requests?: { content?: { parts?: { text?: string }[] } }[] }) =>
  (body.requests?.map((r) => r.content) ?? body.contents ?? []).map((c) => (c?.parts ?? []).map((p) => p.text ?? '').join(' '));

/**
 * Speaks Gemini's REST API (the paths @google/genai calls) over real HTTP, so
 * the compiled API's key pool, SDK and pipeline run end to end with no key and
 * no network. Knows which key made each call, and can answer 429 for chosen
 * keys to exercise rotation.
 */
export class FakeGeminiServer {
  readonly calls: GeminiCall[] = [];
  readonly rateLimited = new Set<string>();
  /** Answer to an extraction prompt; defaults to "nothing found". */
  generate: (prompt: string) => string = () => '{"entities":[],"relations":[]}';
  /** Answer to a summary prompt (told apart by its system instruction); defaults to one point citing the first part. */
  summarize: (prompt: string) => string = (prompt) => {
    const label = /\[([CP]\d+)\]/.exec(prompt)?.[1] ?? 'C1';
    return JSON.stringify({ insufficient: false, summary_points: [{ text: 'Tóm tắt thử', sources: [label] }], decisions: [], action_items: [] });
  };
  /** Answer to a question-answering prompt; defaults to citing the first passage. */
  answer: (prompt: string) => string = (prompt) => {
    const label = /\[(S\d+)\]/.exec(prompt)?.[1];
    return JSON.stringify(
      label
        ? { not_found: false, answer: 'Câu trả lời thử', sources: [label], confidence: 'high' }
        : { not_found: true, answer: '', sources: [], confidence: 'low' },
    );
  };
  private server!: Server;
  baseUrl = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const key = String(req.headers['x-goog-api-key'] ?? '');
        const match = /\/models\/([^:]+):(\w+)/.exec(req.url ?? '');
        const model = match?.[1] ?? '';
        const method = (['batchEmbedContents', 'countTokens', 'generateContent'].includes(match?.[2] ?? '') ? match![2] : 'other') as GeminiCall['method'];
        this.calls.push({ key, method, model });
        const send = (status: number, body: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        if (this.rateLimited.has(key)) {
          send(429, {
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Quota exceeded',
              details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }],
            },
          });
          return;
        }
        const body = raw ? JSON.parse(raw) : {};
        const texts = textsOf(body);
        if (method === 'batchEmbedContents') {
          const dims = body.requests?.[0]?.outputDimensionality ?? 768;
          send(200, { embeddings: texts.map((t: string) => ({ values: fakeEmbedding(t, dims) })) });
        } else if (method === 'countTokens') {
          send(200, { totalTokens: texts.join(' ').split(/\s+/).filter(Boolean).length });
        } else {
          const system = (body.systemInstruction?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join(' ');
          const prompt = texts.join('\n');
          const text = system.includes('executive summary')
            ? this.summarize(prompt)
            : system.includes("answer questions about the user's own meetings")
              ? this.answer(prompt)
              : this.generate(prompt);
          send(200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
        }
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    this.baseUrl = `http://localhost:${(this.server.address() as { port: number }).port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}
