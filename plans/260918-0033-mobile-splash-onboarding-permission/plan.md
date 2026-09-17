---
title: "Mobile — Splash, Onboarding, Quyền Microphone (màn 1–3)"
description: "Dựng ba màn đầu của app Meetio cùng cổng khởi động quyết định onboarding/auth/app mà không nháy sai màn."
status: completed
priority: P2
effort: 16h
branch: main
tags: [mobile, expo-router, onboarding, permissions, ui]
created: 2026-09-18
completed: 2026-09-18
---

# Màn 1–3: Splash · Onboarding · Quyền Microphone

Ba màn đầu trong [design.png](../../design.png) (hàng trên, cột 1–3), cộng **cổng khởi động** —
nơi duy nhất quyết định người dùng rơi vào onboarding, auth hay app.

**Nguồn:** [design.png](../../design.png) · [Kế hoạch tổng](../260917-1821-meetio-full-implementation/plan.md)
(màn 1–2 thuộc Phase 06, màn 3 thuộc Phase 07) · [user_stories.md](../../user_stories.md) E2/E3/E6 ·
**[Quyết định thiết kế](decisions.md)** · **[Sở hữu file](file-ownership.md)**

**Nền đã có:** `(auth)` + `(app)` chạy thật, 39 test mobile xanh. Tái dùng nguyên `colors`,
`typography`, `PrimaryButton`, `LoadingState`, session store, `secure-store.ts`.

**Luồng đích:** Splash → Onboarding (chỉ lần đầu) → Auth → Quyền Micro → Home.
Lần mở sau, đã có session: Splash → Home.

---

## Các phase

| # | Phase | Phụ thuộc | Effort | Trạng thái |
|---|-------|-----------|--------|------------|
| 01 | [Nguyên thể thị giác](phase-01-visual-primitives.md) | — | 3h | ✅ completed |
| 02 | [Lưu cờ thiết bị](phase-02-device-preferences.md) | — | 1.5h | ✅ completed |
| 03 | [expo-audio + cấu hình quyền](phase-03-native-permission-config.md) | — | 1.5h | ✅ completed |
| 04 | [Màn Splash + cổng khởi động](phase-04-splash-and-boot-gate.md) | 01, 02 | 2h | ✅ completed |
| 05 | [Bộ định tuyến khởi động](phase-05-bootstrap-routing.md) | 02 | 1.5h | ✅ completed |
| 06 | [Onboarding 3 trang](phase-06-onboarding-pager.md) | 01, 02, 05 | 2.5h | ✅ completed |
| 07 | [Màn quyền Microphone](phase-07-microphone-permission-screen.md) | 01, 02, 03, 05 | 2.5h | ✅ completed |
| 08 | [Dựng native, tích hợp & QA](phase-08-native-rebuild-and-qa.md) | 04, 06, 07 | 1.5h | 🔶 native xong · **QA máy thật chưa chạy** |

**Chạy song song:** 01 ∥ 02 ∥ 03 khởi công cùng lúc — không phase nào chạm file của phase kia.
Rồi 04 ∥ 05. Rồi 06 ∥ 07. 08 đóng lại. Bản đồ file đầy đủ: [file-ownership.md](file-ownership.md).

---

## Ba quyết định chi phối

1. **Splash không phải route.** Nó là component do `app/_layout.tsx` render trong lúc bootstrap.
   Không route con nào mount trước khi state xong ⇒ không guard nào kịp nháy sai màn.
2. **Mọi lối "xong" đều `router.replace('/')`**, không bao giờ nhảy thẳng tới màn kế.
   `app/index.tsx` là bộ quyết định duy nhất. Kéo theo: `(auth)/_layout.tsx` phải đổi đích
   redirect từ `/(app)` sang `'/'`, nếu không người vừa đăng nhập xong **nhảy qua** màn quyền micro.
3. **`expo-secure-store` giữ hai cờ thiết bị**, không thêm AsyncStorage — lý do và hệ quả khi cài
   lại app ở [decisions.md §3](decisions.md).

## Rủi ro chi phối

| Rủi ro | Khả năng × Tác động | Đối sách | Phase |
|--------|---------------------|----------|-------|
| iOS chỉ mở hộp thoại quyền **một lần** → nút "Cho phép" thành nút chết | Cao × Cao | `canAskAgain === false` ⇒ nút đổi thành "Mở Cài đặt". Đúng AC của US-07 | 07 |
| `NSMicrophoneUsageDescription` không lọt vào Info.plist đã sinh | Trung × Cao | `grep` Info.plist + AndroidManifest là **tiêu chí nghiệm thu bắt buộc** | 08 |
| Nháy sai màn trong lúc hydrate | Trung × Trung | Một cổng bootstrap duy nhất, có test khoá | 04 |
| Đăng nhập xong nhảy thẳng `/(app)`, bỏ qua màn quyền | Cao × Trung | Đổi đích redirect của `(auth)/_layout.tsx` về `'/'` | 05 |
| Minh họa dựng bằng `View` lệch so với design | Trung × Thấp | QA thị giác trên máy thật; đường lùi (SVG/ảnh) đã định giá, chưa dùng | 08 |
| Keychain sống sót qua lần gỡ app trên iOS ⇒ onboarding không hiện lại | Cao × Thấp | Đã đúng như vậy với token sẵn có; ghi nhận + kiểm tay | 02 |

## Vẫn đang mở

- **On-device QA (chưa chạy):** QA thủ công ở phase 08 cần máy thật để kiểm iOS hiện hộp thoại mic **đúng một lần** (flag `canAskAgain` nhanh thành `false` lần thứ 2) và Keychain sống sót qua gỡ app.
- **Thị giác minh họa (chưa kiểm):** Các hình vẽ bằng `View` chưa qua chạy trên simulator/máy thật so với `design.png`.
- **Splash icon gradient (đổi ý):** Đã dùng `primary` fill thay vì gradient design — ghi nhận ở `decisions.md`.

## Chuẩn hoàn thành (đã đạt)

✅ `yarn typecheck && yarn lint && yarn test` xanh ở gốc repo (lint chạy `--max-warnings=0`)
✅ job CI `assert-no-tests-in-expo-router-app-dir` xanh
✅ mọi file mới < 200 dòng
✅ `NSMicrophoneUsageDescription` + `RECORD_AUDIO` có thật trong native đã sinh
✅ 223 test pass (96 API + 127 mobile)
✅ Reviewer: 0 critical, 0 high — 1 medium (dead view state) đã fix
✅ Tester: 0 defect, 100% coverage logic
