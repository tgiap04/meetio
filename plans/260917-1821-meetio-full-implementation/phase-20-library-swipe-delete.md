---
phase: 20
title: Vuốt sang trái để xóa cuộc họp ở Thư viện
status: implemented — awaiting device verification
priority: medium
blockedBy: []
---

# Phase 20 — Vuốt để xóa (US-26)

Xóa hiện chỉ có khi nhấn giữ — khó phát hiện. Bọc `MeetingListRow` ở `app/(app)/(tabs)/library.tsx` bằng
`ReanimatedSwipeable` (react-native-gesture-handler đã cài): vuốt trái hiện nút Xóa đỏ → hộp xác nhận hiện có
→ `useDeleteMeetingWithUndo` (10s hoàn tác). Nhấn giữ vẫn giữ nguyên. Chỉ một dòng mở cùng lúc; mở dòng khác thì đóng dòng cũ.

## Kết quả

**Triển khai xong (chưa commit):**
- ReanimatedSwipeable bọc MeetingListRow với nút Xóa và confirm dialog
- useDeleteMeetingWithUndo (10s undo); long-press giữ nguyên
- GestureHandlerRootView tại root
- Jest tests: confirm + undo (gesture interaction không test, cần device check)

**Vấn đề còn mở:**
- Real gesture interaction chỉ kiểm được trên thiết bị thật
