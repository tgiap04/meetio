import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { toStatusBadgeStatus } from '../components/ui/meeting-status-badge-mapping';
import { STATUS_BADGE_LABEL } from '../components/ui/status-badge';
import type { WidgetSnapshot } from './widget-snapshot';
import { WIDGET_LINKS } from './widget-links';

/**
 * The 4×2 home-screen widget (RemoteViews built by react-native-android-widget). Colours are the
 * app tokens (theme/colors.ts) as literals: the widget library takes `#RRGGBB` strings only.
 * Orange text uses `primaryStrong` — plain `primary` fails contrast on the light card.
 */
const C = {
  card: '#FEF3E6',
  surface: '#FFFFFF',
  text: '#212F3C',
  muted: '#68727F',
  strong: '#AE5A01',
  primary: '#F68001',
  onPrimary: '#FFFFFF',
  danger: '#D64545',
} as const;

function RecordButton({ recording }: { recording: boolean }) {
  return (
    <FlexWidget
      accessibilityLabel={recording ? 'Mở màn hình đang ghi' : 'Ghi cuộc họp mới'}
      clickAction="OPEN_URI"
      clickActionData={{ uri: recording ? WIDGET_LINKS.recordingLive : WIDGET_LINKS.record }}
      style={{
        backgroundColor: recording ? C.danger : C.primary,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <TextWidget style={{ color: C.onPrimary, fontSize: 14, fontWeight: '600' }} text={recording ? '● Đang ghi' : '● Ghi'} />
    </FlexWidget>
  );
}

function MeetingLine({ snapshot }: { snapshot: WidgetSnapshot }) {
  const meeting = snapshot.lastMeeting;
  if (!meeting) {
    return <TextWidget style={{ color: C.muted, fontSize: 14 }} text="Chưa có cuộc họp nào" />;
  }
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.meeting(meeting.id) }}
      style={{ width: 'match_parent', flexDirection: 'column' }}
    >
      <TextWidget style={{ color: C.muted, fontSize: 12 }} text="Cuộc họp gần nhất" />
      <TextWidget
        maxLines={1}
        style={{ color: C.text, fontSize: 15, fontWeight: '600' }}
        text={meeting.title ?? 'Mở khoá để xem tiêu đề'}
        truncate="END"
      />
      <TextWidget style={{ color: C.strong, fontSize: 12 }} text={STATUS_BADGE_LABEL[toStatusBadgeStatus(meeting.status)]} />
    </FlexWidget>
  );
}

function SignedOut() {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.home }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.card, borderRadius: 20, padding: 16, justifyContent: 'center' }}
    >
      <TextWidget style={{ color: C.strong, fontSize: 18, fontWeight: '700' }} text="Meetio" />
      <TextWidget style={{ color: C.muted, fontSize: 14 }} text="Đăng nhập để bắt đầu ghi cuộc họp" />
    </FlexWidget>
  );
}

export function MeetioWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  if (!snapshot.signedIn) return <SignedOut />;
  const actions = snapshot.openActions;
  return (
    <FlexWidget
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: C.card, borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget style={{ color: C.strong, fontSize: 18, fontWeight: '700' }} text="Meetio" />
        <RecordButton recording={snapshot.recording} />
      </FlexWidget>
      <MeetingLine snapshot={snapshot} />
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: WIDGET_LINKS.actions }}
        style={{ backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
      >
        <TextWidget
          style={{ color: C.text, fontSize: 13 }}
          text={actions === null ? 'Việc cần làm' : `${actions} việc cần làm chưa xong`}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
