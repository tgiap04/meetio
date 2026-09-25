import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import type { MeetingDetailResponse } from '@meetio/shared';
import { MeetingDetailHero } from './meeting-detail-hero';

function meeting(overrides: Partial<MeetingDetailResponse> = {}): MeetingDetailResponse {
  return {
    id: 'm1',
    title: 'Weekly Sync',
    status: 'ready',
    source_language: 'vi',
    translate_to: null,
    started_at: '2026-01-15T09:00:00.000Z',
    ended_at: '2026-01-15T09:30:00.000Z',
    duration_sec: 1800,
    created_at: '2026-01-15T09:00:00.000Z',
    audio_source: 'device_mic',
    recording_quality: 'standard',
    summary: null,
    summary_citations: null,
    failure_reason: null,
    segment_count: 10,
    action_items: [],
    processing_steps: [],
    has_unprocessed_edits: false,
    updated_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  } as MeetingDetailResponse;
}

function render(props: Partial<Parameters<typeof MeetingDetailHero>[0]> = {}) {
  const merged = {
    meeting: meeting(),
    onTitleSave: jest.fn(),
    hasUnprocessedEdits: false,
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingDetailHero {...merged} />);
  });
  return { renderer, onTitleSave: merged.onTitleSave };
}

describe('MeetingDetailHero', () => {
  it('shows the meeting title in an editable field', () => {
    const { renderer } = render();
    expect(renderer.root.findByType(TextInput).props.value).toBe('Weekly Sync');
  });

  it('saves the trimmed title on blur when it changed', () => {
    const { renderer, onTitleSave } = render();
    act(() => {
      renderer.root.findByType(TextInput).props.onChangeText('  New title  ');
    });
    act(() => {
      renderer.root.findByType(TextInput).props.onBlur();
    });
    expect(onTitleSave).toHaveBeenCalledWith('New title');
  });

  it('does not save on blur when the title is unchanged', () => {
    const { renderer, onTitleSave } = render();
    act(() => {
      renderer.root.findByType(TextInput).props.onBlur();
    });
    expect(onTitleSave).not.toHaveBeenCalled();
  });

  it('shows the "đang cập nhật" notice when there are unprocessed edits', () => {
    const { renderer } = render({ hasUnprocessedEdits: true });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts.join(' ')).toContain('đang cập nhật');
  });

  it('resyncs the field when the server title changes underneath it', () => {
    const { renderer } = render();
    act(() => {
      renderer.update(<MeetingDetailHero hasUnprocessedEdits={false} meeting={meeting({ title: 'Renamed' })} onTitleSave={jest.fn()} />);
    });
    expect(renderer.root.findByType(TextInput).props.value).toBe('Renamed');
  });
});
