# Phase 06 — Kiểm chứng máy thật + kịch bản demo + bảng báo cáo (không cắt)

## Context Links
- [Master plan 260917](../260917-1821-meetio-full-implementation/plan.md) Phase 07/08/18/19/21 — đang "chờ máy thật"
- [Biên bản brainstorm](../reports/brainstorm-2026-10-05-android-advanced-features-for-final-grade.md)

## Overview
- Priority: P1 · Effort: 2d · Status: 🟡 in progress — luồng chính + 4 tính năng đã kiểm trên máy; còn kịch bản demo + video dự phòng · Blocked by: Phase 02, 03, 04 (và 05 nếu không cắt)
- **Còn lại cho người dùng:** kiểm trên máy thật, kịch bản demo, video dự phòng.
- **Xong:** `docs/android-integration.md` (bảng tính năng → thành phần Android → file).
- Rủi ro lớn nhất của buổi bảo vệ là luồng ghi chính lỗi khi demo live. Phase này kiểm luồng chính
  + 4 tính năng mới trên **đúng máy sẽ mang đi demo**, rồi chốt kịch bản và bảng ánh xạ cho báo cáo.

## Requirements
- Luồng chính chạy trọn 3 lần liên tiếp không lỗi: đăng nhập → bắt đầu ghi → tắt màn hình 1 phút →
  pause/resume → kết thúc → pipeline xong → tóm tắt + action item → hỏi đáp có trích dẫn.
- Mỗi tính năng mới có checklist đạt/không đạt trên máy demo.
- Kịch bản demo ≤ 5 phút cho phần tính năng mới, có phương án B khi mạng hỏng.

## Implementation Steps
1. Build release-like (`expo run:android --variant release`) lên máy demo; tắt tối ưu pin/bật autostart cho Meetio (MIUI).
2. Chạy luồng chính 3 lần; lỗi → mở `/tkm:fix-bug`, sửa trước khi làm tiếp.
3. Checklist tính năng mới:
   - Khoá: bật → đóng app → mở → prompt; <30s không khoá; ≥30s khoá; khoá không dừng ghi.
   - Shortcuts: 3 cái mở đúng màn, kể cả khi app đã tắt hẳn.
   - Widget: 4 trạng thái; click đúng; ẩn tiêu đề khi khoá bật; sau 5 lần update click vẫn ăn.
   - Notification: pause/resume/end từ màn khoá.
   - Cuộc gọi (nếu làm): gọi di động + VoIP.
4. Viết `docs/android-integration.md`: bảng **tính năng → thành phần Android → file**, gồm cả cái đã có
   (foreground service `microphone`, config plugin Manifest, Kotlin Expo Module ML Kit, SQLite offline queue,
   runtime permission, push FCM, deep link) + 4 cái mới; mỗi dòng 1 câu "vì sao cần".
5. Kịch bản demo: thứ tự gợi ý — widget "Ghi" từ màn hình chính → ghi 30s → khoá màn hình → pause/resume
   trên notification → (gọi điện vào máy) → kết thúc → mở lại app qua vân tay → shortcut "Hỏi AI".
6. Phương án B: quay sẵn video từng tính năng; chuẩn bị sẵn một cuộc họp đã xử lý xong để hỏi đáp khi mạng chậm.
7. Cập nhật `docs/project-changelog.md` nếu có, trạng thái plan.

## Todo List
- [x] build lên máy demo + chỉnh pin/autostart
- [x] luồng chính ×3 (verified on device by the user, 2026-10-05)
- [x] checklist 4 tính năng (verified on device by the user (2026-10-05))
- [x] docs/android-integration.md
- [ ] kịch bản demo + video dự phòng
- [x] cập nhật trạng thái plan

## Success Criteria
- Luồng chính đạt 3/3; mọi mục checklist đạt (mục trượt có ghi chú + đã cắt khỏi kịch bản); có bảng ánh xạ và video dự phòng.

## Risk Assessment
- Lỗi luồng chính ở ngày cuối → bắt đầu phase này sớm nhất có thể; luồng chính kiểm ngay sau Phase 01 cũng được.

## Security Considerations
- Không demo bằng tài khoản/cuộc họp chứa dữ liệu thật của người khác.
