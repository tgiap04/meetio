import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { QuotaExceededError } from '../ai/ai-errors.js';
import { M, target, fakeStore, echoModel, setup } from './__tests__/translation-test-kit.js';

describe('TranslationService.retry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

    it('translates one untranslated segment, stores it and emits', async () => {
      const t = setup();
      await expect(t.service.retry(M, 'u1', 4)).resolves.toEqual({ seq: 4, translated_text: 'en4', translated_to: 'en-US' });
      expect(t.store.rows.get(4)?.translatedText).toBe('en4');
      expect(t.notifier.segmentTranslated).toHaveBeenCalledWith(M, { seq: 4, translated_text: 'en4', translated_to: 'en-US' });
    });

    it('is idempotent: an already-translated segment is returned without a model call', async () => {
      const t = setup();
      t.store.rows.set(4, { text: 'vi4', translatedText: 'done', translatedTo: 'en-US' });
      await expect(t.service.retry(M, 'u1', 4)).resolves.toEqual({ seq: 4, translated_text: 'done', translated_to: 'en-US' });
      expect(t.generateText).not.toHaveBeenCalled();
    });

    it('re-translates a segment whose stored translation is for a language the meeting no longer wants', async () => {
      const t = setup();
      t.store.rows.set(4, { text: 'vi4', translatedText: 'bonjour', translatedTo: 'fr-FR' });
      await expect(t.service.retry(M, 'u1', 4)).resolves.toEqual({ seq: 4, translated_text: 'en4', translated_to: 'en-US' });
      expect(t.store.rows.get(4)).toMatchObject({ translatedText: 'en4', translatedTo: 'en-US' });
    });

    it('404s for another user, a missing meeting and a missing segment — all alike', async () => {
      const t = setup();
      await expect(t.service.retry(M, 'stranger', 4)).rejects.toMatchObject({ status: 404 });
      await expect(t.service.retry(M, 'u1', 99)).rejects.toMatchObject({ status: 404 });
      expect(t.generateText).not.toHaveBeenCalled();
    });

    it('400s when the meeting has translation off', async () => {
      const t = setup(echoModel, fakeStore({ ...target, translateTo: null }));
      await expect(t.service.retry(M, 'u1', 4)).rejects.toMatchObject({ status: 400 });
    });

    it('503s when the model fails, 429 when the budget is spent; nothing is stored', async () => {
      const failing = setup(() => {
        throw new Error('boom');
      });
      await expect(failing.service.retry(M, 'u1', 4)).rejects.toBeInstanceOf(HttpException);
      await expect(failing.service.retry(M, 'u1', 4)).rejects.toMatchObject({ status: 503 });
      const broke = setup(() => {
        throw new QuotaExceededError(1, 1);
      });
      await expect(broke.service.retry(M, 'u1', 4)).rejects.toMatchObject({ status: 429 });
      expect(broke.store.rows.get(4)?.translatedText).toBeNull();
    });
});
