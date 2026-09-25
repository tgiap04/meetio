import { useMutation } from '@tanstack/react-query';
import type { ExportSection } from '@meetio/shared';
import { exportMeetingAndShare, type ExportFileFormat } from '../utils/export-meeting';

export interface ExportMeetingVariables {
  format: ExportFileFormat;
  sections: readonly ExportSection[];
}

/** Wraps `exportMeetingAndShare` (US-27) as a mutation so the export sheet
 *  gets a loading/error state for free. */
export function useExportMeetingMutation(meetingId: string, meetingTitle: string) {
  return useMutation({
    mutationFn: ({ format, sections }: ExportMeetingVariables) =>
      exportMeetingAndShare({ meetingId, meetingTitle, format, sections }),
  });
}
