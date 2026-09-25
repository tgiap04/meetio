import * as SecureStore from 'expo-secure-store';
import { readLastReadSeq, writeLastReadSeq } from './transcript-read-position';

describe('transcript-read-position', () => {
  it('returns null when nothing has been saved yet', async () => {
    expect(await readLastReadSeq('m-unseen')).toBeNull();
  });

  it('round-trips a saved seq', async () => {
    await writeLastReadSeq('m1', 42);
    expect(await readLastReadSeq('m1')).toBe(42);
  });

  it('keeps positions for different meetings separate', async () => {
    await writeLastReadSeq('m1', 10);
    await writeLastReadSeq('m2', 20);
    expect(await readLastReadSeq('m1')).toBe(10);
    expect(await readLastReadSeq('m2')).toBe(20);
  });

  it('fails open to null when the stored value is corrupted', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValueOnce('not-a-number');
    expect(await readLastReadSeq('m3')).toBeNull();
  });

  it('fails open to null when the underlying read throws', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockRejectedValueOnce(new Error('keychain unavailable'));
    expect(await readLastReadSeq('m4')).toBeNull();
  });
});
