import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { translate, type TranslationLanguage } from '../../modules/mlkit-translate';
import { putSegmentTranslation } from '../api/segment-translation';

export interface TranslatableMeeting {
  source_language: string;
  translate_to: string | null;
}

/**
 * Translates one saved segment on the device (ML Kit), stores it with the meeting
 * (`PUT .../translation`) and refreshes the transcript. For segments that have no translation:
 * a failed one from recording, or one whose text was edited (the server cleared the old translation).
 * Rejects on any failure so the row can show it.
 */
export function useTranslateSegment(meetingId: string, meeting: TranslatableMeeting | undefined) {
  const queryClient = useQueryClient();
  return useCallback(
    async (segment: { seq: number; text: string }): Promise<void> => {
      const target = meeting?.translate_to;
      if (!meeting || !target) throw new Error('Meeting does not translate');
      const translated = (await translate(segment.text, meeting.source_language as TranslationLanguage, target as TranslationLanguage)).trim();
      if (!translated) throw new Error('Empty translation');
      await putSegmentTranslation(undefined, meetingId, segment.seq, { translated_text: translated, translated_to: target as TranslationLanguage });
      await queryClient.invalidateQueries({ queryKey: ['segments', meetingId] });
    },
    [meetingId, meeting, queryClient],
  );
}
