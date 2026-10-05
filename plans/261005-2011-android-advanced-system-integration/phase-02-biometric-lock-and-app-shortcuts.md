# Phase 02 — Khoá sinh trắc + App Shortcuts

## Context Links
- `apps/mobile/src/storage/device-preferences.ts`, `apps/mobile/src/store/preferences.store.ts`
- `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/(tabs)/settings.tsx`
- US-03 (bảo vệ dữ liệu), US-02 AC (phiên ghi không bị gián đoạn)

## Overview
- Priority: P1 · Effort: 1.5d · Status: implemented — pending device verification · Blocked by: Phase 01
- (a) Bật trong Cài đặt → mở app hoặc quay lại sau ≥ 30s ở nền thì phải xác thực (BiometricPrompt,
  fallback PIN/pattern thiết bị). (b) Nhấn giữ icon app → 3 shortcut: **Ghi cuộc họp mới**, **Hỏi AI**,
  **Việc cần làm**.

## Key Insights
- Gate nút bật bằng `getEnrolledLevelAsync() !== SecurityLevel.NONE` (máy chỉ có PIN trả `SECRET` và vẫn dùng được).
- **Không** đặt `disableDeviceFallback: true` — máy chỉ có PIN sẽ báo `not_enrolled`.
- Khoá là lớp phủ UI: phiên ghi chạy tiếp bên dưới. Không khoá lại khi prompt đang mở (prompt tự đẩy app vào trạng thái `background` trên một số máy → vòng lặp).
- Shortcut Android của expo-quick-actions chỉ là dynamic → `setItems` khi app khởi động; route bằng
  `useQuickActionRouting()` + `params.href`.

## Deviations from Plan

1. **App lock preferences location**: Lock flag stored in new files `apps/mobile/src/security/app-lock-preference.ts` and `apps/mobile/src/security/app-lock.store.ts` instead of extending `device-preferences.ts` / `preferences.store.ts`. This keeps security-specific logic isolated.

2. **useQuickActionRouting placement**: Lives in `apps/mobile/app/(app)/_layout.tsx` (library requires a sub-layout) instead of root layout.

3. **Recents privacy**: Added `modules/recents-privacy` for app-switcher thumbnail privacy — calls `setRecentsScreenshotEnabled` on API 33+ with fallback to `FLAG_SECURE`.

4. **Lock cover**: Lock screen hides content from TalkBack screen reader for accessibility.

## Requirements
- Functional
  - Công tắc "Khoá bằng vân tay" trong Cài đặt; bật thì phải xác thực thành công một lần mới lưu.
  - Mở app nguội khi đã bật → màn khoá trước mọi route `(app)`.
  - Từ nền về sau ≥ 30s → màn khoá; < 30s → không.
  - Huỷ prompt → ở lại màn khoá với nút "Mở khoá".
  - Shortcut Ghi mới → `/recording-setup`; Hỏi AI → `/ask`; Việc cần làm → `/actions`. Chưa đăng nhập → route guard sẵn có đưa về login.
  - Deep link từ widget / notification / shortcut cũng đi qua màn khoá.
- Non-functional: thêm < 50ms khởi động; mỗi file < 200 dòng.

## Architecture
```
app/_layout.tsx ── useQuickActionRouting() + registerAppShortcuts()
app/(app)/_layout.tsx ── <AppLockGate> bao <Stack/>
AppLockGate ── useAppLock(): { locked, unlock() }
   ├─ đọc appLockEnabled từ preferences.store
   ├─ AppState: lưu backgroundedAt; active & now-backgroundedAt ≥ 30s → locked
   └─ unlock() → LocalAuthentication.authenticateAsync({ promptMessage: 'Mở khoá Meetio' })
```
- Logic thời gian tách thành hàm thuần `shouldLockOnResume(backgroundedAt, now, thresholdMs)` để test.

## Related Code Files
- Create: `apps/mobile/src/security/app-lock-preference.ts` (device preference key + getter)
- Create: `apps/mobile/src/security/app-lock.store.ts` (Zustand store: `appLockEnabled`, `setAppLockEnabled`)
- Create: `apps/mobile/src/security/biometric-auth.ts` (bọc expo-local-authentication: `canUseAppLock()`, `authenticate()`)
- Create: `apps/mobile/src/hooks/use-app-lock-lifecycle.ts` (AppState listener + lock gate logic)
- Create: `apps/mobile/src/components/security/app-lock-gate.tsx` (màn khoá theo theme hiện có)
- Create: `apps/mobile/src/components/settings/settings-security-section.tsx` (switch + explanation)
- Create: `apps/mobile/src/navigation/app-shortcuts.ts` (danh sách 3 shortcut + `registerAppShortcuts()`, `useQuickActionRouting()`)
- Create: `apps/mobile/modules/recents-privacy/` (Kotlin module: `setRecentsScreenshotEnabled` API 33+ với `FLAG_SECURE` fallback)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (wrap routes với `<AppLockGate>`, gọi `useQuickActionRouting()`)
- Modify: `apps/mobile/app/(app)/(tabs)/settings.tsx` (thêm security section)
- Tests: `app-lock-lifecycle.test.ts`, `settings-security-section.test.tsx`, `app-shortcuts.test.ts`

## Implementation Steps
1. Viết test + `app-lock-policy.ts`.
2. Mở rộng device-preferences + store (test trước). Đăng xuất **không** xoá cờ (là cờ thiết bị, như hai cờ cũ).
3. `biometric-auth.ts`: `canUseAppLock()` = `hasHardwareAsync() && getEnrolledLevelAsync() !== NONE`.
4. `use-app-lock.ts` + `app-lock-gate.tsx`; cờ `promptOpen` chặn khoá lại khi prompt đang mở.
5. Section cài đặt: switch, disabled + dòng giải thích khi `canUseAppLock()` false.
6. `app-shortcuts.ts`: gọi `QuickActions.setItems([...])` một lần khi boot xong; `useQuickActionRouting()` ở root layout.
7. Chạy typecheck + test.

## Todo List
- [x] policy + test
- [x] preferences + store + test
- [x] biometric wrapper
- [x] hook + gate + test
- [x] settings section + test
- [x] shortcuts + routing + test
- [x] typecheck + suite xanh
- [ ] device verification: bật khoá → đóng app → mở lại → prompt vân tay
- [ ] device verification: huỷ prompt → kẹt ở màn khoá; ghi âm không dừng
- [ ] device verification: 3 shortcut mở đúng màn

## Success Criteria
- Test mới xanh; trên máy: bật khoá → đóng app → mở lại → prompt vân tay; huỷ → kẹt ở màn khoá; ghi âm đang chạy thì khoá không làm dừng ghi; 3 shortcut mở đúng màn.

## Risk Assessment
- Vòng lặp khoá do prompt gây AppState change → cờ `promptOpen`.
- MIUI có thể đổi tên/icon shortcut → chấp nhận.

## Security Considerations
- Khoá chỉ là rào UI cục bộ, không thay thế token/US-03 phía server — ghi rõ trong báo cáo.
- Không lưu kết quả sinh trắc; chỉ lưu cờ bật/tắt.

## Next Steps
- Phase 03 dùng `appLockEnabled` để ẩn tiêu đề cuộc họp trên widget.
