import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ExportSection } from '@meetio/shared';
import { exportMeeting } from '../api/meetings';
import { ensureVietnameseFontStack } from './export-html-fonts';
import { sanitizeExportFileName } from './export-file-name';

export type ExportFileFormat = 'markdown' | 'pdf';

export interface ExportMeetingOptions {
  meetingId: string;
  meetingTitle: string;
  format: ExportFileFormat;
  sections: readonly ExportSection[];
}

/**
 * Best-effort cleanup for a temp export file — logs rather than throws, since
 * a failed delete must never surface as an "export failed" error to the user
 * when the share itself already succeeded (or already failed for its own
 * reason, which the caller's `finally` has already let propagate).
 */
function deleteQuietly(file: File): void {
  try {
    file.delete();
  } catch (error) {
    console.warn('[export] failed to delete temp export file', error);
  }
}

/**
 * Fetches the meeting export from the server and hands it to the OS share
 * sheet (US-27). Nothing is uploaded anywhere — the file only ever lives in
 * this app's cache directory and whatever the user picks in the share sheet.
 *
 * The temp file is deleted once `Sharing.shareAsync` settles, success or
 * failure (`finally`) — meeting content (transcripts, summaries) must not
 * accumulate in the app's cache across exports. Trade-off, stated rather than
 * left implicit: on iOS, `shareAsync` resolves once the share sheet itself is
 * dismissed, which can be before a slow target app has finished reading the
 * file — an inherent limitation of the share-sheet API, not something this
 * function can observe or wait out.
 */
export async function exportMeetingAndShare({
  meetingId,
  meetingTitle,
  format,
  sections,
}: ExportMeetingOptions): Promise<void> {
  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error('Chia sẻ tệp không khả dụng trên thiết bị này.');
  }

  const include = sections.join(',');
  const baseName = sanitizeExportFileName(meetingTitle);

  if (format === 'markdown') {
    const markdown = await exportMeeting(meetingId, { format: 'markdown', include });
    const file = new File(Paths.cache, `${baseName}.md`);
    file.create({ overwrite: true });
    file.write(markdown);
    try {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Xuất cuộc họp' });
    } finally {
      deleteQuietly(file);
    }
    return;
  }

  const html = await exportMeeting(meetingId, { format: 'html', include });
  const { uri } = await Print.printToFileAsync({ html: ensureVietnameseFontStack(html) });
  const pdfFile = new File(uri);
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Xuất cuộc họp' });
  } finally {
    deleteQuietly(pdfFile);
  }
}
