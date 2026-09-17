---
phase: 08
title: "Dựng native, tích hợp & QA"
status: in_progress
priority: P1
effort: 1.5h
blockedBy: [04, 06, 07]
blocks: []
---

> **Phần máy thật chưa chạy.** Dựng native xong và đã kiểm bằng grep rằng chuỗi quyền lọt vào
> Info.plist + AndroidManifest. Nhưng 9 bước QA tay vẫn còn bỏ trống — hai quan sát chỉ máy thật
> trả lời được (iOS chỉ hiện hộp thoại quyền một lần · Keychain sống sót qua lần gỡ app) chưa ai
> ghi nhận. Phase này **chưa** đóng.

# Phase 08 — Dựng native, tích hợp & QA

**Liên kết:** [plan.md](plan.md) · [decisions.md](decisions.md) · [file-ownership.md](file-ownership.md) ·
`Makefile` mục `build-app` / `app-verify` / `app-ios` / `app-android` / `app-clean` / `app-doctor` ·
[kế hoạch tổng](../260917-1821-meetio-full-implementation/plan.md)

## Tổng quan

Đóng lại kế hoạch: sinh project native đúng một lần cho cả ba phase trước, **chứng minh** quyền đã
lọt vào file native đã sinh, chạy QA tay cho những thứ Jest không với tới, rồi cập nhật kế hoạch tổng.

## Nhận định then chốt

- `expo-audio` là dependency **native**. Sửa `package.json` + `app.json` **không** đụng tới `ios/` và
  `android/` đã sinh từ trước. Bắt buộc `make build-app` rồi `make app-ios`.
- `apps/mobile/ios` và `apps/mobile/android` **nằm trong `.gitignore`** (`git ls-files` trả về 0 file
  cho cả hai). Nên prebuild **không** tạo diff git nào — rủi ro "prebuild xoá sửa đổi native đã
  commit" ở dự án này **không tồn tại**. Ghi ra đây để không ai phải lo hão.
- `make build-app` chạy `expo prebuild` **và nuốt lỗi** (`|| true`), sau đó mới `app-verify` kiểm
  riêng. Nên **không được** đọc "lệnh chạy xong" là "prebuild thành công" — bằng chứng là kết quả
  `grep` ở dưới, không phải exit code.
- Hành vi "iOS chỉ hỏi quyền một lần" **không thể** kiểm bằng Jest. Phải chạy tay, và phải **xoá app**
  giữa các lần thử để đặt lại trạng thái quyền.

## Yêu cầu

1. Native sinh lại, có `NSMicrophoneUsageDescription` và `RECORD_AUDIO` — **chứng minh bằng `grep`**.
2. Toàn bộ cổng tự động xanh ở gốc repo.
3. QA tay 9 bước đạt hết.
4. Kế hoạch tổng cập nhật trạng thái ba màn.

## Các bước

### A. Cổng tự động

```bash
cd /Users/tgiap.dev/devs/meetio
yarn install
yarn typecheck
yarn lint                     # --max-warnings=0
yarn test
```

### B. Sinh native + chứng minh quyền

```bash
make build-app                # expo prebuild + app-verify
make app-doctor               # lệch phiên bản thư viện so với SDK 57

# BẰNG CHỨNG — cả ba lệnh phải ra kết quả, không được rỗng:
grep -A1 NSMicrophoneUsageDescription apps/mobile/ios/Meetio/Info.plist
grep RECORD_AUDIO apps/mobile/android/app/src/main/AndroidManifest.xml
grep MODIFY_AUDIO_SETTINGS apps/mobile/android/app/src/main/AndroidManifest.xml
```

Chuỗi in ra phải **đúng nguyên văn** chuỗi trong `app.json`:
`Meetio cần quyền truy cập microphone để ghi âm cuộc họp và chuyển giọng nói thành văn bản.`

`MODIFY_AUDIO_SETTINGS` **có mặt là đúng** — plugin `expo-audio` luôn thêm nó, không phải lỗi.

Nếu `grep` rỗng: `make app-clean` (xoá hẳn `ios/` + `android/` rồi sinh lại) và `grep` lại. Vẫn rỗng
⇒ sai khóa plugin ⇒ quay về [phase 03](phase-03-native-permission-config.md), **không** sửa tay
Info.plist (prebuild sau sẽ ghi đè và lỗi quay lại im lặng).

### C. Kiểm ràng buộc dự án

```bash
# không file nào từ 200 dòng trở lên
find apps/mobile/src apps/mobile/app -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1>=200 && $2!="total"'

# không test nào dưới app/  (chính là job CI)
find apps/mobile/app -type f \( -name '*.test.*' -o -name '*.spec.*' \)

# màn hình không chạm thẳng expo-audio
grep -rn "expo-audio" apps/mobile/app/

# không chữ cam nhạt trên nền sáng ở màn mới
grep -n "colors.primary\b" apps/mobile/app/onboarding.tsx "apps/mobile/app/(app)/permission.tsx"
```

Cả bốn lệnh phải ra **rỗng**.

### D. QA tay — `make app-ios` (và `make app-android` nếu có máy)

Xoá app khỏi thiết bị trước bước 1 để đặt lại **cả** cờ lẫn trạng thái quyền.

| # | Bước | Kỳ vọng |
|---|---|---|
| 1 | Mở app lần đầu | Splash hiện ≥ ~0,9 s: nền kem, 2 mảng peach, ô icon cam + 5 vạch, chữ **Meetio**, tagline 2 dòng, 3 chấm chấm đầu dài |
| 2 | Chờ splash | Sang **onboarding**, không nháy qua login |
| 3 | Vuốt ngang | 3 trang; chấm bám theo; nội dung trang 2 = dịch song song, trang 3 = đồ thị + hỏi đáp |
| 4 | Bấm "Bắt đầu" ở trang 1 | Lật sang trang 2, **không** thoát onboarding |
| 5 | Tới trang 3, bấm "Bắt đầu" | Sang màn **đăng nhập** |
| 6 | Đăng nhập | Sang màn **quyền Microphone** (đây là bước bắt lỗi `(auth)/_layout` — nếu vào thẳng Home là sai) |
| 7 | Bấm "Cho phép" | **Hộp thoại hệ thống thật** hiện ra, đúng chuỗi tiếng Việt ở `app.json`. Chọn *Cho phép* → vào Home |
| 8 | Kill app, mở lại | Splash → **Home**. Không onboarding, không màn quyền |
| 9 | Xoá app, cài lại, đăng nhập lại, tới màn quyền, bấm "Cho phép", chọn **Từ chối** | Ở lại màn quyền, nút đổi thành **"Mở Cài đặt"**, có dòng giải thích. Bấm nó → mở đúng trang Cài đặt **của Meetio**. Quay lại app → ở Home |

**Hai quan sát phải ghi vào hand-back:**

- **Bước 9 trên iOS, bấm "Cho phép" lần nữa sau khi đã từ chối:** xác nhận hộp thoại **không** hiện
  lại (đây là hành vi một-lần của iOS mà cả thiết kế màn hình dựa vào).
- **Keychain sống sót qua lần gỡ app (iOS):** sau bước 9 (xoá + cài lại), ghi lại onboarding **có**
  hiện lại hay không. [decisions §3](decisions.md) dự đoán là **không** trên iOS. Ghi số liệu thật,
  không ghi theo dự đoán.

### E. Cập nhật kế hoạch tổng

Trong `plans/260917-1821-meetio-full-implementation/plan.md`, mục **Thiết kế giao diện**: đánh dấu
màn 1–2 và màn 3 đã dựng, kèm liên kết về kế hoạch này. **Không** đổi trạng thái Phase 06/07 sang
"xong" — hai phase đó còn nhiều phần khác chưa làm.

## Todo

- [x] `yarn install && yarn typecheck && yarn lint && yarn test` xanh
- [x] `make build-app` + `make app-doctor`
- [x] `grep` Info.plist ra đúng chuỗi tiếng Việt
- [x] `grep` AndroidManifest ra `RECORD_AUDIO`
- [x] 4 lệnh kiểm ràng buộc đều rỗng
- [ ] QA tay 9 bước trên iOS (chưa chạy — cần máy thật)
- [ ] QA tay trên Android (chưa chạy — cần máy thật)
- [ ] Ghi 2 quan sát (iOS một-lần · Keychain qua lần gỡ) (chưa — đợi QA tay)
- [x] Cập nhật mục "Thiết kế giao diện" của kế hoạch tổng

## Chuẩn hoàn thành (đo được)

| Tiêu chí | Cách kiểm |
|---|---|
| `yarn typecheck && yarn lint && yarn test` xanh ở gốc repo | exit code 0 cả ba |
| Số test mobile tăng từ 39 lên ≥ 90 | kết quả `jest` |
| `NSMicrophoneUsageDescription` có, đúng chuỗi | `grep -A1` Info.plist |
| `RECORD_AUDIO` có trong manifest | `grep` |
| Không file nào ≥ 200 dòng | lệnh `find | xargs wc -l | awk` ra rỗng |
| Không test dưới `app/` | job CI + lệnh `find` ra rỗng |
| 9 bước QA đều đạt | đánh dấu trong hand-back |
| Bước 6 đi qua màn quyền, không vào thẳng Home | QA tay |
| Kế hoạch tổng đã cập nhật | `git diff` file đó |

## Rủi ro

| Rủi ro | K × T | Đối sách |
|---|---|---|
| `expo prebuild` thất bại âm thầm (`\|\| true` trong Makefile nuốt lỗi) | Trung × Cao | Không tin exit code; `app-verify` + 3 lệnh `grep` mới là bằng chứng |
| `pod install` chết vì lệch SDK Xcode/CommandLineTools | Trung × Trung | Makefile đã ép `DEVELOPER_DIR` + `SDKROOT`; `app-verify` in sẵn hướng dẫn gỡ |
| Chỉ QA trên simulator ⇒ bỏ sót hành vi quyền thật | Trung × Cao | Bước 7 và 9 **phải** chạy trên máy thật hoặc simulator có mic; ghi rõ đã chạy ở đâu |
| Minh họa dựng bằng `View` lệch so với design khi nhìn thật | Trung × Thấp | Mở `design.png` cạnh thiết bị; chỉnh `size`/tỉ lệ trong file của phase 01. Đường lùi (ảnh PNG cam kết / `react-native-svg`) đã định giá ở [decisions §5](decisions.md) |
| Native splash (trước khi JS chạy) nhảy màu sang splash của ta | Trung × Thấp | Ghi nhận ở bước 1. Cấu hình native splash ngoài phạm vi vì `assets/splash-icon.png` vẫn là ảnh mẫu Expo |

**Rollback toàn kế hoạch:** revert theo thứ tự ngược 07 → 06 → 05 → 04 → 03 → 02 → 01, rồi
`yarn install && make build-app`. Không có migration cơ sở dữ liệu, không có thay đổi API, không có
dữ liệu người dùng phía server nào bị đụng — toàn bộ state mới đều nằm trên máy và vô hại khi mồ côi.

## An toàn / bảo mật

- Trước khi kết thúc, xác nhận chuỗi quyền in trong Info.plist **nói đúng** thứ app làm. Chuỗi sai
  lệch là lý do bị App Review từ chối, và tệ hơn, là một lời hứa sai với người dùng.
- Xác nhận `AndroidManifest` **không** dây thêm quyền nào ngoài `RECORD_AUDIO` và
  `MODIFY_AUDIO_SETTINGS`.
- Xác nhận `enableBackgroundRecording` vẫn tắt: `grep -i "FOREGROUND_SERVICE" AndroidManifest.xml`
  **phải rỗng** ở giai đoạn này.

## Tiếp theo

- Màn 4 (Trang chủ) theo bản đồ của kế hoạch tổng.
- Kiểm quyền micro **tại chỗ bấm ghi âm** — Phase 07 của kế hoạch tổng, dùng lại
  `readMicrophonePermission()` + `resolveMicPermissionView()` đã có sẵn từ phase 03 ở đây.
- Hai khoản nợ ghi trong hand-back: ảnh icon app vẫn là mẫu Expo; link chữ ở
  `(app)/index.tsx` + `(auth)/login.tsx` vẫn dùng `colors.primary`.
