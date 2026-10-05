import { chunkDirectoryName, purgeChunkFiles, type ChunkDirEntry } from './server-stt-chunk-files';

const entry = (name: string, onDelete?: () => void): ChunkDirEntry & { deleted: boolean } => ({
  name,
  deleted: false,
  delete() {
    onDelete?.();
    this.deleted = true;
  },
});

describe('purgeChunkFiles', () => {
  it('deletes leftover chunk recordings and nothing else', () => {
    const chunk = entry('recording-3f2a.m4a');
    const other = entry('keep-me.m4a');
    const sub = entry('recording-folder');
    const txt = entry('recording-x.txt');
    expect(purgeChunkFiles({ exists: true, list: () => [chunk, other, sub, txt] })).toBe(1);
    expect([chunk.deleted, other.deleted, sub.deleted, txt.deleted]).toEqual([true, false, false, false]);
  });

  it('does nothing when the directory does not exist yet', () => {
    const list = jest.fn(() => []);
    expect(purgeChunkFiles({ exists: false, list })).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });

  it('skips a file that cannot be deleted and still removes the rest', () => {
    const stuck = entry('recording-a.m4a', () => {
      throw new Error('EBUSY');
    });
    const fine = entry('recording-b.m4a');
    expect(purgeChunkFiles({ exists: true, list: () => [stuck, fine] })).toBe(1);
    expect(fine.deleted).toBe(true);
  });
});

describe('chunkDirectoryName', () => {
  it('matches where expo-audio records on each platform', () => {
    expect(chunkDirectoryName('ios')).toBe('ExpoAudio');
    expect(chunkDirectoryName('android')).toBe('Audio');
  });
});
