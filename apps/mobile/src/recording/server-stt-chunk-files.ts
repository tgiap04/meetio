/**
 * Chunk files are deleted right after their upload attempt, but a kill (swipe-away, crash, OOM)
 * between "recorded" and "deleted" leaves audio behind in the cache. expo-audio decides where
 * recordings go — `<cache>/Audio` on Android, `<cache>/ExpoAudio` on iOS, named `recording-<uuid>.m4a`
 * — and this app records nowhere else, so everything matching that name there is a chunk nobody
 * will ever upload. It is purged whenever the engine opens and when the app starts.
 */
export interface ChunkDirEntry {
  name: string;
  delete(): void;
}

export interface ChunkDir {
  exists: boolean;
  list(): ChunkDirEntry[];
}

const CHUNK_FILE_NAME = /^recording-.+\.m4a$/;

/** The sub-directory of the cache directory expo-audio records into. */
export const chunkDirectoryName = (os: string): string => (os === 'ios' ? 'ExpoAudio' : 'Audio');

/** Deletes leftover chunk files; a file that cannot be deleted is skipped. Returns how many went. */
export function purgeChunkFiles(dir: ChunkDir): number {
  if (!dir.exists) return 0;
  let purged = 0;
  for (const entry of dir.list()) {
    if (!CHUNK_FILE_NAME.test(entry.name)) continue;
    try {
      entry.delete();
      purged += 1;
    } catch {
      // Still in use or already gone — the next purge will try again.
    }
  }
  return purged;
}
