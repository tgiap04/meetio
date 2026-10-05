import TestRenderer, { act } from 'react-test-renderer';
import { MeetingStatus } from '@meetio/shared';
import { MeetioWidget } from './meetio-widget';
import { SIGNED_OUT_SNAPSHOT, type WidgetSnapshot } from './widget-snapshot';
import { WIDGET_LINKS } from './widget-links';

const signedIn: WidgetSnapshot = {
  v: 1,
  signedIn: true,
  recording: false,
  openActions: 2,
  lastMeeting: { id: 'm 1', title: 'Họp kế hoạch', status: MeetingStatus.READY },
  updatedAt: 1,
};

function render(snapshot: WidgetSnapshot) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<MeetioWidget snapshot={snapshot} />);
  });
  const root = tree.root;
  const texts = root.findAll((n) => (n.type as unknown) === 'TextWidget').map((n) => n.props.text as string);
  const links = root
    .findAll((n) => n.props.clickAction === 'OPEN_URI')
    .map((n) => (n.props.clickActionData as { uri: string }).uri);
  return { texts, links };
}

it('signed out: one tap target that opens the app', () => {
  const { texts, links } = render(SIGNED_OUT_SNAPSHOT);
  expect(texts.join(' ')).toContain('Đăng nhập');
  expect(links).toEqual([WIDGET_LINKS.home]);
});

it('signed in: record button, latest meeting with its status, and the to-do count', () => {
  const { texts, links } = render(signedIn);
  expect(texts).toEqual(expect.arrayContaining(['● Ghi', 'Họp kế hoạch', 'Đã xử lý', '2 việc cần làm chưa xong']));
  expect(links).toEqual([WIDGET_LINKS.record, WIDGET_LINKS.meeting('m 1'), WIDGET_LINKS.actions]);
  expect(WIDGET_LINKS.meeting('m 1')).toBe('meetio://meeting-detail?id=m%201');
});

it('recording: the button reopens the live screen instead of starting another meeting', () => {
  const { texts, links } = render({ ...signedIn, recording: true });
  expect(texts).toContain('● Đang ghi');
  expect(links[0]).toBe(WIDGET_LINKS.recordingLive);
});

it('app lock on: no meeting title on the home screen', () => {
  const { texts } = render({ ...signedIn, lastMeeting: { ...signedIn.lastMeeting!, title: null } });
  expect(texts).not.toContain('Họp kế hoạch');
  expect(texts).toContain('Mở khoá để xem tiêu đề');
});

it('no meeting yet and to-dos not loaded', () => {
  const { texts, links } = render({ ...signedIn, lastMeeting: null, openActions: null });
  expect(texts).toEqual(expect.arrayContaining(['Chưa có cuộc họp nào', 'Việc cần làm']));
  expect(links).toEqual([WIDGET_LINKS.record, WIDGET_LINKS.actions]);
});
