import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
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
    onRenamePress: jest.fn(),
    hasUnprocessedEdits: false,
    ...props,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<MeetingDetailHero {...merged} />);
  });
  return { renderer, onRenamePress: merged.onRenamePress };
}

describe('MeetingDetailHero', () => {
  it('shows the meeting title as plain text, not an editable field', () => {
    const { renderer } = render();
    expect(renderer.root.findAllByType(Text).map((n) => n.props.children)).toContain('Weekly Sync');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Tiêu đề cuộc họp' })).toHaveLength(0);
  });

  it('pencil button is labelled, at least 44pt, and calls onRenamePress', () => {
    const { renderer, onRenamePress } = render();
    const button = renderer.root.findByProps({ accessibilityLabel: 'Đổi tên cuộc họp' });
    expect(button.props.accessibilityRole).toBe('button');
    const flat = Object.assign({}, ...[button.props.style].flat());
    expect(flat.width).toBeGreaterThanOrEqual(44);
    expect(flat.height).toBeGreaterThanOrEqual(44);
    act(() => button.props.onPress());
    expect(onRenamePress).toHaveBeenCalledTimes(1);
  });

  it('shows the "đang cập nhật" notice when there are unprocessed edits', () => {
    const { renderer } = render({ hasUnprocessedEdits: true });
    const texts = renderer.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts.join(' ')).toContain('đang cập nhật');
  });
});
