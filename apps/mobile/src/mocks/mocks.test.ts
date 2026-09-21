import { isRenderableVietnameseText } from '../theme/typography';
import {
  ABOUT_MEETIO_ENTRIES,
  ACTION_ITEMS,
  AUDIO_SOURCE_OPTIONS,
  GRAPH_EDGES,
  GRAPH_NODES,
  GRAPH_RELATIONS,
  MEETING_SUMMARY,
  MEETINGS,
  RECORDING_SETTINGS_DEFAULTS,
  SEARCH_FIELD_PLACEHOLDER,
  SEARCH_GROUPS,
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
  strings.push(MEETING_SUMMARY.paragraph);
  for (const item of ACTION_ITEMS) strings.push(item.title, item.assignee);
  for (const node of GRAPH_NODES) {
    strings.push(node.label);
    if (node.caption) strings.push(node.caption);
  }
  for (const relation of GRAPH_RELATIONS) strings.push(relation.verb);
  for (const option of AUDIO_SOURCE_OPTIONS) {
    strings.push(option.label);
    if (option.description) strings.push(option.description);
  }
  strings.push(RECORDING_SETTINGS_DEFAULTS.language, RECORDING_SETTINGS_DEFAULTS.qualityMode);
  for (const entry of [...SETTINGS_ENTRIES, ...ABOUT_MEETIO_ENTRIES]) {
    strings.push(entry.label);
    if (entry.value) strings.push(entry.value);
  }
  strings.push(SEARCH_FIELD_PLACEHOLDER);
  for (const group of SEARCH_GROUPS) {
    strings.push(group.label);
    for (const item of group.items) {
      if (item.kind === 'meeting') strings.push(item.title, item.snippet);
      if (item.kind === 'document') strings.push(item.title, item.relatedTo);
      if (item.kind === 'person') strings.push(item.name);
    }
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

describe('meeting-detail.mock', () => {
  it('summary references the Sprint Review meeting', () => {
    expect(MEETING_SUMMARY.meetingId).toBe('sprint-review');
    expect(MEETING_SUMMARY.paragraph.length).toBeGreaterThan(0);
  });

  it('holds three action items with unique ids', () => {
    expect(ACTION_ITEMS).toHaveLength(3);
    const ids = ACTION_ITEMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('knowledge-graph.mock', () => {
  it('holds five nodes with unique ids', () => {
    expect(GRAPH_NODES).toHaveLength(5);
    const ids = GRAPH_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one central node, and only it carries a caption', () => {
    const central = GRAPH_NODES.filter((n) => n.isCentral);
    expect(central).toHaveLength(1);
    expect(central[0].id).toBe('du-an-abc');
    expect(central[0].caption).toBeDefined();
    for (const node of GRAPH_NODES.filter((n) => !n.isCentral)) {
      expect(node.caption).toBeUndefined();
    }
  });

  it('every edge and relation references nodes that exist', () => {
    const nodeIds = new Set(GRAPH_NODES.map((n) => n.id));
    for (const edge of GRAPH_EDGES) {
      expect(nodeIds.has(edge.fromId)).toBe(true);
      expect(nodeIds.has(edge.toId)).toBe(true);
    }
    for (const relation of GRAPH_RELATIONS) {
      expect(nodeIds.has(relation.subjectId)).toBe(true);
      expect(nodeIds.has(relation.objectId)).toBe(true);
    }
  });

  it('every node carries a distinct palette key from its sibling of the same type', () => {
    const personKeys = GRAPH_NODES.filter((n) => n.type === 'person').map((n) => n.paletteKey);
    const taskKeys = GRAPH_NODES.filter((n) => n.type === 'task').map((n) => n.paletteKey);
    expect(new Set(personKeys).size).toBe(personKeys.length);
    expect(new Set(taskKeys).size).toBe(taskKeys.length);
  });
});

describe('search-results.mock', () => {
  it('holds exactly three groups, and the meeting group really holds 3 items', () => {
    expect(SEARCH_GROUPS.map((g) => g.kind)).toEqual(['meeting', 'document', 'person']);
    const meetingGroup = SEARCH_GROUPS.find((g) => g.kind === 'meeting');
    expect(meetingGroup?.items).toHaveLength(3);
  });

  it('every meeting item status is a member of MeetingStatus', () => {
    const meetingGroup = SEARCH_GROUPS.find((g) => g.kind === 'meeting');
    for (const item of meetingGroup?.items ?? []) {
      expect(VALID_MEETING_STATUSES).toContain(item.status);
    }
  });

  it('every group id is unique', () => {
    const ids = SEARCH_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
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
