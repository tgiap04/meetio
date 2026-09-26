import { isRenderableVietnameseText } from '../theme/typography';
import {
  ABOUT_MEETIO_ENTRIES,
  AUDIO_SOURCE_OPTIONS,
  MEETINGS,
  RECORDING_SETTINGS_DEFAULTS,
  SETTINGS_ENTRIES,
  TRANSCRIPT_LINES,
  type MeetingStatus,
} from './index';

const VALID_MEETING_STATUSES: readonly MeetingStatus[] = ['done', 'processing', 'queued'];

/** Collects every Vietnamese-bearing string across all fixtures for one pass
 *  through `isRenderableVietnameseText`, mirroring `typography.test.ts`. */
function collectAllStrings(): string[] {
  const strings: string[] = [];

  for (const meeting of MEETINGS) strings.push(meeting.title);
  for (const line of TRANSCRIPT_LINES) {
    strings.push(line.text);
    if (line.translation) strings.push(line.translation);
  }
  for (const option of AUDIO_SOURCE_OPTIONS) {
    strings.push(option.label);
    if (option.description) strings.push(option.description);
  }
  strings.push(RECORDING_SETTINGS_DEFAULTS.language, RECORDING_SETTINGS_DEFAULTS.qualityMode);
  for (const entry of [...SETTINGS_ENTRIES, ...ABOUT_MEETIO_ENTRIES]) {
    strings.push(entry.label);
    if (entry.value) strings.push(entry.value);
  }
  return strings;
}

describe('meetings.mock', () => {
  it('holds all four meetings from the design', () => {
    expect(MEETINGS).toHaveLength(4);
    expect(MEETINGS.map((m) => m.title)).toEqual([
      'Sprint Review',
      'Client Discussion',
      'Project Planning',
      'Marketing Brief',
    ]);
  });

  it('every id is unique and every status is a member of MeetingStatus', () => {
    const ids = MEETINGS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const meeting of MEETINGS) {
      expect(VALID_MEETING_STATUSES).toContain(meeting.status);
    }
  });

  it('Project Planning is the only processing meeting, matching its badge', () => {
    const processing = MEETINGS.filter((m) => m.status === 'processing');
    expect(processing.map((m) => m.id)).toEqual(['project-planning']);
  });
});

describe('transcript.mock', () => {
  it('holds four lines with unique ids', () => {
    expect(TRANSCRIPT_LINES).toHaveLength(4);
    const ids = TRANSCRIPT_LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('attaches a translation to the first line only', () => {
    const withTranslation = TRANSCRIPT_LINES.filter((l) => l.translation !== undefined);
    expect(withTranslation).toHaveLength(1);
    expect(withTranslation[0].id).toBe('line-1');
  });
});

describe('recording-options.mock', () => {
  it('holds two audio source options with unique ids', () => {
    expect(AUDIO_SOURCE_OPTIONS).toHaveLength(2);
    const ids = AUDIO_SOURCE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('translation is enabled by default, targeting English', () => {
    expect(RECORDING_SETTINGS_DEFAULTS.translationEnabled).toBe(true);
    expect(RECORDING_SETTINGS_DEFAULTS.translationTarget).toBe('Tiếng Anh');
  });
});

describe('settings-entries.mock', () => {
  it('holds five settings rows, two "Về Meetio" rows, and every id is unique', () => {
    expect(SETTINGS_ENTRIES).toHaveLength(5);
    expect(ABOUT_MEETIO_ENTRIES).toHaveLength(2);
    const ids = [...SETTINGS_ENTRIES, ...ABOUT_MEETIO_ENTRIES].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Vietnamese rendering', () => {
  it('every Vietnamese string across all fixtures is renderable by the system font', () => {
    for (const text of collectAllStrings()) {
      expect(isRenderableVietnameseText(text)).toBe(true);
    }
  });
});
