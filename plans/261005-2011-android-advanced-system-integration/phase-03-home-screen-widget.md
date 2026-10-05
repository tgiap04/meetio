# Phase 03 — Home-screen widget

## Context Links
- [Nghiên cứu thư viện §3](../reports/researcher-2026-10-05-android-advanced-libs.md)
- `apps/mobile/src/hooks/use-meetings-query.ts`, `apps/mobile/src/hooks/use-actions-list-query.ts`
- `apps/mobile/src/recording/recording.store.ts`, `apps/mobile/src/theme/colors.ts`

## Overview
- Priority: P1 · Effort: 2d · Status: ✅ done — verified on device by the user (2026-10-05) · Blocked by: Phase 01
- Widget 4×2 trên màn hình chính: nút **● Ghi cuộc họp**, số **việc cần làm chưa xong**, **cuộc họp gần nhất**
  (tiêu đề + trạng thái). Đang ghi thì widget hiện "Đang ghi — chạm để mở".

## Key Insights
- Headless task handler chạy khi JS app có thể chưa sống → **không** đọc zustand, **không** gọi API.
  App ghi một snapshot JSON; handler chỉ đọc file.
- `clickAction="OPEN_URI"` chạy native, không cần JS → dùng cho mọi click (tránh issue #154).
- `updatePeriodMillis` tối thiểu 30 phút → cập nhật chủ yếu bằng `requestWidgetUpdate` từ app.

## Requirements
- Functional
  - Click "Ghi" → `meetio://recording-setup`; click cuộc họp → `meetio://meeting-detail?id=<id>`;
    click việc cần làm → `meetio://actions`; đang ghi → `meetio://recording-live`.
  - Snapshot cập nhật khi: danh sách cuộc họp/việc cần làm tải xong, phase ghi đổi, đăng xuất.
  - Đăng xuất → snapshot rỗng → widget hiện "Đăng nhập để bắt đầu", click mở app.
  - `appLockEnabled` bật → **ẩn tiêu đề cuộc họp**, chỉ hiện số liệu.
- Non-functional: render < 100ms; màu từ `colors.ts`, chữ cam dùng `primaryStrong`.

## Architecture
```
App (JS sống)                                 Launcher
 useWidgetSnapshotSync() ─ build snapshot ─> widget-snapshot.json (documentDirectory)
        └─ requestWidgetUpdate(MeetioWidget) ──────> render
widget-task-handler (headless) ─ WIDGET_ADDED/UPDATE/RESIZED ─ đọc json ─> <MeetioWidget/>
```
```ts
interface WidgetSnapshot {
  v: 1; signedIn: boolean; recording: boolean;
  openActions: number;
  lastMeeting: { id: string; title: string | null; status: MeetingStatus } | null; // title null khi khoá bật
  updatedAt: number;
}
```

## Related Code Files
- Create: `apps/mobile/src/widget/widget-snapshot.ts` (kiểu + `buildWidgetSnapshot()` thuần + read/write file)
- Create: `apps/mobile/src/widget/meetio-widget.tsx` (FlexWidget/TextWidget, 4 trạng thái)
- Modify: `apps/mobile/src/widget/widget-task-handler.tsx` (render snapshot từ task handler)
- Create: `apps/mobile/src/hooks/use-widget-snapshot-sync.ts` (subscribe query cache + recording store + session; debounce 1s)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (gọi hook)
- Modify: `apps/mobile/src/store/session.store.ts` (logout → ghi snapshot rỗng + update widget)
- Modify: `apps/mobile/app.config.ts` (previewImage), Create: `apps/mobile/assets/widget-preview.png`
- Tests: `widget-snapshot.test.ts`, `meetio-widget.test.tsx`, `use-widget-snapshot-sync.test.tsx`

## Implementation Steps
1. Test + `buildWidgetSnapshot()` thuần (input: meetings page, actions, recording phase, lock flag, signedIn).
2. read/write snapshot; đọc lỗi/JSON hỏng → snapshot mặc định `signedIn:false` (không crash widget).
3. `meetio-widget.tsx` theo 4 trạng thái: chưa đăng nhập / bình thường / đang ghi / chưa có cuộc họp.
4. Task handler: WIDGET_ADDED, WIDGET_UPDATE, WIDGET_RESIZED → đọc snapshot, render; WIDGET_DELETED → bỏ qua.
5. Hook sync + debounce; gắn vào `(app)/_layout.tsx`; logout ghi snapshot rỗng + update.
6. Preview image; build máy thật; kiểm 4 trạng thái + click.

## Todo List
- [x] snapshot builder + test
- [x] file IO + fallback
- [x] widget UI 4 trạng thái + test
- [x] task handler
- [x] sync hook + test + logout
- [x] preview + build
- [x] device verification: tạo cuộc họp mới → widget cập nhật ≤ 2s
- [x] device verification: bật khoá → tiêu đề biến mất
- [x] device verification: mọi click mở đúng màn (qua màn khoá nếu bật)

## Success Criteria
- Test xanh; trên máy: tạo cuộc họp mới → quay về home → widget đổi trong ≤ 2s; bật khoá → tiêu đề biến mất; mọi click mở đúng màn (qua màn khoá nếu bật).

## Risk Assessment
- Issue #154 (click mất sau re-render) → chỉ dùng OPEN_URI; kiểm lại sau 5 lần update.
- Launcher khác nhau kích thước (#34) → layout co giãn, test trên launcher máy demo.
- MIUI chặn update nền → chấp nhận, update chủ yếu khi app mở.

## Security Considerations
- Tiêu đề cuộc họp hiện trên màn hình chính = lộ thông tin khi máy bị nhìn trộm → ẩn khi khoá bật.
- Snapshot ở internal storage; `allowBackup: false` sẵn có; không chứa token, transcript.

## Next Steps
- Phase 06 kiểm trên máy demo.
