import { SIGNED_OUT_SNAPSHOT, type WidgetSnapshot } from './widget-snapshot';

const mockDisk = new Map<string, string>();
let mockFailRead = false;
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    private key: string;
    constructor(dir: string, name: string) {
      this.key = `${dir}/${name}`;
    }
    get exists() {
      return mockDisk.has(this.key);
    }
    create() {
      mockDisk.set(this.key, '');
    }
    write(text: string) {
      mockDisk.set(this.key, text);
    }
    async text() {
      if (mockFailRead) throw new Error('io');
      return mockDisk.get(this.key) ?? '';
    }
  },
}));

import { readWidgetSnapshot, writeWidgetSnapshot } from './widget-snapshot-file';

const snapshot: WidgetSnapshot = { ...SIGNED_OUT_SNAPSHOT, signedIn: true, openActions: 4, updatedAt: 9 };

beforeEach(() => {
  mockDisk.clear();
  mockFailRead = false;
});

it('reads signed out before anything was written', async () => {
  await expect(readWidgetSnapshot()).resolves.toEqual(SIGNED_OUT_SNAPSHOT);
});

it('round-trips a written snapshot through app-private storage', async () => {
  writeWidgetSnapshot(snapshot);
  expect([...mockDisk.keys()]).toEqual(['doc/widget-snapshot.json']);
  await expect(readWidgetSnapshot()).resolves.toEqual(snapshot);
});

it('reads signed out when the file cannot be read', async () => {
  writeWidgetSnapshot(snapshot);
  mockFailRead = true;
  await expect(readWidgetSnapshot()).resolves.toEqual(SIGNED_OUT_SNAPSHOT);
});
