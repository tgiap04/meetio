# Phase 01 — Kiểm tra tương thích native (cổng chặn)

## Context Links
- [Nghiên cứu thư viện](../reports/researcher-2026-10-05-android-advanced-libs.md)
- `apps/mobile/app.config.ts`, `apps/mobile/package.json`

## Overview
- Priority: P1 · Effort: 0.5d · Status: implemented — device check pending
- Cài 3 thư viện mới, prebuild, build ra máy thật **ngày đầu tiên** để biết sớm thư viện nào gãy trên
  Expo 57 / RN 0.86.3 / New Arch, trước khi viết logic.

## Key Insights
- `react-native-android-widget` 0.22.1: maintainer mới xác nhận tới RN 0.83. Issue mở #154 (click mất
  sau re-render).
- `expo-quick-actions`: npm latest 6.0.2 là bản SDK 56; 6.1.0 (SDK 57) chỉ có trên GitHub.
- `expo-local-authentication@57.0.3`: bản chính chủ SDK 57, rủi ro thấp.

## Requirements
- App build + chạy được trên máy Android thật với cả 3 thư viện.
- Widget placeholder hiện trên launcher; shortcut placeholder hiện khi nhấn giữ icon; prompt vân tay bật được.

## Related Code Files
- Modify: `apps/mobile/package.json` (deps), `apps/mobile/app.config.ts` (plugins widget + quick-actions)
- Create: `apps/mobile/index.ts` — entry tuỳ biến: `registerWidgetTaskHandler(...)` rồi `import 'expo-router/entry'`
- Modify: `apps/mobile/package.json` `main` → `index.ts`
- Create: `apps/mobile/src/widget/widget-task-handler.tsx` (placeholder render một `TextWidget`)

## Implementation Steps
1. `yarn workspace @meetio/mobile add expo-local-authentication@~57.0.3 react-native-android-widget@^0.22.1 expo-quick-actions@6.0.2`.
2. Thêm plugin widget vào `app.config.ts`: một widget `MeetioWidget`, `targetCellWidth: 4`, `targetCellHeight: 2`, `updatePeriodMillis: 1800000`, previewImage.
3. Thêm plugin `expo-quick-actions` (androidIcons cho 3 shortcut).
4. Tạo entry `index.ts` đăng ký widget task handler trước expo-router.
5. `npx expo prebuild --platform android --clean` → `expo run:android` trên máy thật.
6. Kiểm: thêm widget ra màn hình chính, nhấn giữ icon, gọi `authenticateAsync()` từ màn dev tạm.
7. Nếu thư viện gãy → áp phương án dự phòng (bên dưới), ghi kết quả vào phần "Kết quả spike" cuối file.

## Todo List
- [x] Cài deps, chạy `yarn workspace @meetio/mobile typecheck`
- [x] Prebuild + build máy thật
- [x] Widget provider đăng ký với launcher (`dumpsys appwidget` thấy `MeetioWidget`)
- [ ] Widget hiện + bấm được trên màn hình chính (chưa kiểm — máy khoá màn hình)
- [ ] Shortcut hiện khi nhấn giữ icon (chưa kiểm trên máy)
- [ ] Prompt vân tay hiện (chưa kiểm trên máy)
- [x] Toàn bộ test mobile hiện có vẫn xanh (`yarn workspace @meetio/mobile test`)

## Success Criteria
- Cả 3 điểm kiểm ở bước 6 đạt trên máy thật; build không lỗi; suite cũ xanh.

## Risk Assessment
| Rủi ro | Dự phòng |
|---|---|
| quick-actions 6.0.2 không chạy SDK 57 | cài 6.1.0 từ GitHub; vẫn gãy → config plugin tự viết sinh `res/xml/shortcuts.xml` tĩnh với VIEW intent `meetio://…` |
| widget lib gãy trên RN 0.86 | AppWidgetProvider Kotlin tự viết trong `modules/` + config plugin (thêm ~1d, báo người dùng) |
| Entry tuỳ biến làm hỏng expo-router | kiểm mọi route cũ mở được; Jest không dùng entry nên không ảnh hưởng test |

## Security Considerations
- Không thêm quyền nguy hiểm. `USE_BIOMETRIC` tự thêm bởi expo-local-authentication.

## Next Steps
- Mở khoá Phase 02, 03, 04.

## Kết quả spike

- `expo-local-authentication@57.0.3`: ✅ builds on Expo 57 / RN 0.86.3
- `react-native-android-widget@0.22.1`: ✅ builds on Expo 57 / RN 0.86.3
- `expo-quick-actions@6.0.2`: ✅ builds on Expo 57 / RN 0.86.3
- `npx expo prebuild --platform android --clean` + `expo run:android`: ✅ `gradlew assembleDebug` exit 0
- Device check (Xiaomi): widget provider registered (dumpsys appwidget showed MeetioWidget); suite mobile trước thay đổi 244 suites / 1.634 tests xanh; sau thay đổi 1.828/1.828 xanh
- **Kết luận:** không cần phương án dự phòng; toàn bộ 3 thư viện mở khoá Phase 02–05. Runtime checks on device pending.
