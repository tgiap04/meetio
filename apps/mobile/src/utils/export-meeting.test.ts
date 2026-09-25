import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { exportMeeting } from '../api/meetings';
import { exportMeetingAndShare } from './export-meeting';

jest.mock('../api/meetings', () => ({
  exportMeeting: jest.fn(),
}));

const mockFileCreate = jest.fn();
const mockFileWrite = jest.fn();
const mockFileDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'FAKE_CACHE_DIR' },
  // Two call shapes exercised: `new File(Paths.cache, 'name.md')` (markdown
  // export) and `new File(uri)` (wrapping expo-print's PDF output for cleanup).
  File: jest.fn().mockImplementation((...args: unknown[]) => ({
    uri: args.length > 1 ? `file:///cache/${args[1]}` : (args[0] as string),
    create: mockFileCreate,
    write: mockFileWrite,
    delete: mockFileDelete,
  })),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockedExportMeeting = exportMeeting as jest.Mock;
const mockedPrintToFileAsync = Print.printToFileAsync as jest.Mock;
const mockedIsAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const mockedShareAsync = Sharing.shareAsync as jest.Mock;

describe('exportMeetingAndShare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsAvailableAsync.mockResolvedValue(true);
    mockedShareAsync.mockResolvedValue(undefined);
  });

  it('writes markdown to the cache dir and shares it as text/markdown', async () => {
    mockedExportMeeting.mockResolvedValue('# Tóm tắt\n\nNội dung');

    await exportMeetingAndShare({
      meetingId: 'm1',
      meetingTitle: 'Họp Sprint',
      format: 'markdown',
      sections: ['summary', 'actions'],
    });

    expect(mockedExportMeeting).toHaveBeenCalledWith('m1', { format: 'markdown', include: 'summary,actions' });
    expect(mockFileCreate).toHaveBeenCalledWith({ overwrite: true });
    expect(mockFileWrite).toHaveBeenCalledWith('# Tóm tắt\n\nNội dung');
    expect(mockedShareAsync).toHaveBeenCalledWith('file:///cache/Họp_Sprint.md', {
      mimeType: 'text/markdown',
      dialogTitle: 'Xuất cuộc họp',
    });
  });

  it('renders html to PDF with the Vietnamese font stack and shares it', async () => {
    mockedExportMeeting.mockResolvedValue('<p>Nội dung</p>');
    mockedPrintToFileAsync.mockResolvedValue({ uri: 'file:///cache/out.pdf' });

    await exportMeetingAndShare({
      meetingId: 'm1',
      meetingTitle: 'Họp Sprint',
      format: 'pdf',
      sections: ['summary'],
    });

    expect(mockedPrintToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('Noto Sans') }),
    );
    expect(mockedShareAsync).toHaveBeenCalledWith('file:///cache/out.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'Xuất cuộc họp',
    });
  });

  it('deletes the temp markdown file once sharing resolves', async () => {
    mockedExportMeeting.mockResolvedValue('# Tóm tắt');

    await exportMeetingAndShare({
      meetingId: 'm1',
      meetingTitle: 'Họp Sprint',
      format: 'markdown',
      sections: ['summary'],
    });

    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it('deletes the temp PDF file once sharing resolves', async () => {
    mockedExportMeeting.mockResolvedValue('<p>Nội dung</p>');
    mockedPrintToFileAsync.mockResolvedValue({ uri: 'file:///cache/out.pdf' });

    await exportMeetingAndShare({
      meetingId: 'm1',
      meetingTitle: 'Họp Sprint',
      format: 'pdf',
      sections: ['summary'],
    });

    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it('still deletes the temp file when the share sheet itself fails, and re-throws the original error', async () => {
    mockedExportMeeting.mockResolvedValue('# Tóm tắt');
    mockedShareAsync.mockRejectedValue(new Error('share sheet dismissed with an error'));

    await expect(
      exportMeetingAndShare({ meetingId: 'm1', meetingTitle: 'x', format: 'markdown', sections: ['summary'] }),
    ).rejects.toThrow('share sheet dismissed with an error');
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });

  it('does not let a failed cleanup delete mask a successful export', async () => {
    mockedExportMeeting.mockResolvedValue('# Tóm tắt');
    mockFileDelete.mockImplementationOnce(() => {
      throw new Error('delete failed — file already gone');
    });

    await expect(
      exportMeetingAndShare({ meetingId: 'm1', meetingTitle: 'x', format: 'markdown', sections: ['summary'] }),
    ).resolves.toBeUndefined();
  });

  it('throws without calling the export API when sharing is unavailable', async () => {
    mockedIsAvailableAsync.mockResolvedValue(false);

    await expect(
      exportMeetingAndShare({ meetingId: 'm1', meetingTitle: 'x', format: 'markdown', sections: ['summary'] }),
    ).rejects.toThrow('Chia sẻ tệp không khả dụng trên thiết bị này.');
    expect(mockedExportMeeting).not.toHaveBeenCalled();
  });
});
