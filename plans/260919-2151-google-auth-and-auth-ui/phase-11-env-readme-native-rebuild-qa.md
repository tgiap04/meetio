---
phase: 11
title: "Env + README + dựng lại native + app-verify + QA máy thật"
status: awaiting-qa
priority: P1
effort: 2.5h
blockedBy: [00, 03, 08, 10]
blocks: []
note: "Manual in-device QA is required; automated checks complete."
---

# Phase 11 — Env, README, dựng native, xác minh, QA máy thật

**Liên kết:** [plan.md](plan.md) · [decisions §13 (`prebuild` mặc định clean)](decisions.md) ·
[decisions §14 (`app.config.ts`)](decisions.md) · [file-ownership.md](file-ownership.md) ·
[phase-08](phase-08-google-signin-library-and-native-wrapper.md) ·
[phase-03](phase-03-google-id-token-endpoint.md) ·
[phase-00 (đường env)](phase-00-expo-public-env-reaches-the-bundle.md)

> **Phase này KHÔNG kết thúc bằng một lệnh xanh.** Nó kết thúc bằng một lần đăng nhập Google thật
> trên máy thật, mà **chỉ người dùng làm được** — họ là người có quyền vào Google Cloud Console.
> Mọi thứ tự động hoá được nằm ở AC #1–#7; phần còn lại là danh sách QA tay.

## Tổng quan

Đóng vòng: viết hướng dẫn tạo OAuth client từng bước, dạy `app-verify` kiểm thứ `expo prebuild` hay
làm rơi, dựng lại native, rồi QA tay cả luồng — cộng với năm màn mà phase 04 đã chạm.

## Nhận định then chốt

- **`expo prebuild` MẶC ĐỊNH là clean.** Đọc thẳng CLI đang cài,
  `node_modules/@expo/cli/build/src/prebuild/index.js:112`: `clean: !args['--no-clean']`. Nên
  `make build-app` (Makefile:196, chạy `expo prebuild` trần) **xoá và dựng lại** `ios/` + `android/`
  mỗi lần. README cũng nói đúng như vậy.

  Hệ quả: lớp lỗi "`iosUrlScheme` không sống sót qua prebuild sạch" (issues #1313 / #1280 /
  expo#36412) **có áp dụng ở đây**. Bước `grep` Info.plist không phải cho đủ lệ — nó là thứ **duy
  nhất** đứng giữa một lần prebuild im lặng làm rơi URL scheme và một cú
  `NSInvalidArgumentException` trên máy thật.
- **`app-verify` phải bỏ qua sạch khi chưa cấu hình.** Hôm nay chưa ai có client ID; bắt lỗi ngay là
  làm gãy `make build-app` của mọi người vì một tính năng họ chưa bật.
- **`DEVELOPER_ERROR` (mã 10) trên Android gần như luôn là SHA-1 chưa đăng ký** cho đúng cấu hình ký
  đang dùng. Debug, release, EAS Build và Play App Signing là **bốn chứng chỉ khác nhau**, mỗi cái
  cần một Android OAuth client riêng. Đây là hố người ta rơi nhiều nhất — README phải nói thẳng.

## Yêu cầu

**Chức năng**

1. `Makefile` — `app-verify` thêm lần kiểm thứ ba:

   | `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Info.plist chứa `com.googleusercontent.apps.` | Kết quả |
   |---|---|---|
   | rỗng / chưa đặt | — | `–  ios google — bỏ qua (chưa cấu hình)` |
   | đã đặt | có | `✅ ios google — URL scheme đã vào Info.plist` |
   | đã đặt | không | `❌ ios google — prebuild làm rơi URL scheme` + `exit 1` |

   Tìm bằng `grep -rq 'com\.googleusercontent\.apps\.' apps/mobile/ios/*/Info.plist` (thư mục con
   mang tên project, đừng đóng cứng). Giữ nguyên văn phong thông báo sẵn có của target.
2. `Makefile` — target `env` thêm bốn khoá Google **để trống**. `GOOGLE_OAUTH_AUDIENCES` vào `.env`
   gốc; ba khoá `EXPO_PUBLIC_GOOGLE_*` vào **cả hai** file, tức là mở rộng danh sách cho phép mà
   [phase 00](phase-00-expo-public-env-reaches-the-bundle.md) đã dựng cho `apps/mobile/.env`.
   Kèm một dòng chú thích trỏ về README.
3. `README.md` — mục mới **"Google Sign-In setup"**, đặt ngay sau "Native builds":
   1. Tạo project trên Google Cloud Console, bật màn hình đồng ý OAuth.
   2. Tạo **Web application** client ID → đây là `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` **và** giá trị
      của `GOOGLE_OAUTH_AUDIENCES` phía máy chủ. Nói rõ **vì sao**: ID token do SDK phát mang `aud`
      là client ID web, kể cả trên iOS.
   3. Tạo **iOS** client ID với `bundleIdentifier` = `com.tobi-04.meetio` → lấy
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` và **reversed client ID** →
      `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`.
   4. Tạo **Android** client ID với package `com.tobi_04.meetio` + SHA-1. Lấy SHA-1 debug:
      ```
      keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore \
              -storepass android -keypass android
      ```
      hoặc `cd apps/mobile/android && ./gradlew signingReport`. Ghi rõ: **giá trị client ID Android
      không dùng ở đâu trong code** — chỉ cần nó tồn tại. Và **mỗi cấu hình ký cần một client
      riêng** (debug ≠ release ≠ EAS ≠ Play App Signing).
   5. Điền 4 khoá vào `.env`.
   6. `make build-app` → `make app-ios` / `make app-android`.
   7. Mục **"Khi hỏng thì xem gì"**: `DEVELOPER_ERROR`/10 → SHA-1; `NSInvalidArgumentException` →
      URL scheme (và `make app-verify` đã bắt được chưa); `idToken` null → thiếu `webClientId`;
      500 "chưa cấu hình" → `GOOGLE_OAUTH_AUDIENCES` rỗng ở máy chủ.
   8. Một câu nói rõ: **client ID là định danh công khai, không phải bí mật** — vì thế chúng nằm
      trong `.env.example` và trong native đã sinh.
4. Chạy `make build-app` và `make app-verify` thật.

**Phi chức năng**

- Không sửa code ứng dụng trong phase này. Hỏng thì sửa ở phase sở hữu file đó.
- Không commit `apps/mobile/ios/` hay `android/` — đã trong `.gitignore`.

## File liên quan

Sửa: `Makefile` · `README.md`

## Các bước triển khai

1. Sửa `app-verify`; chạy `make app-verify` với env **rỗng** — phải thấy dòng "bỏ qua", **thoát 0**.
2. Thêm bốn khoá vào target `env`; xoá `.env` thử ở một thư mục tạm, chạy `make env`, kiểm có đủ.
3. Viết mục README.
4. `make build-app` với env rỗng — phải thành công, và `expo config` không có entry plugin Google.
5. Bàn giao cho người dùng danh sách QA tay dưới đây.

## Todo

- [ ] `app-verify` kiểm Info.plist (3 nhánh)
- [ ] `make env` thêm 4 khoá
- [ ] README mục "Google Sign-In setup" + mục gỡ lỗi
- [ ] `make build-app` xanh với env rỗng
- [ ] Bàn giao danh sách QA tay

## Tiêu chí nghiệm thu — tự động

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 1 | `make app-verify` với `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` rỗng | thoát **0**, in dòng "bỏ qua" |
| 2 | `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.fake make app-verify` trên `ios/` chưa có scheme | thoát **1**, thông báo nói rõ prebuild làm rơi URL scheme |
| 3 | `make build-app` với env Google rỗng | thoát 0; `app-verify` báo ✅ android + ✅ ios + `–` ios google |
| 4 | Xoá `.env` + `apps/mobile/.env` trong một bản sao tạm, chạy `make env`, rồi `grep -c GOOGLE .env` và `grep -c EXPO_PUBLIC_GOOGLE apps/mobile/.env` | `>= 4` và `>= 3` |
| 4b | sau `make env`: `cd apps/mobile && node scripts/check-public-env.cjs` (script của phase 00) | thoát 0 — danh sách cho phép mở rộng rồi vẫn đúng |
| 5 | `grep -c "Google Sign-In setup" README.md` | `>= 1` |
| 6 | `grep -c "androiddebugkey\|signingReport" README.md` | `>= 1` |
| 7 | `yarn typecheck && yarn lint && yarn test` | thoát 0 |

## Tiêu chí nghiệm thu — QA tay (người dùng làm, có máy thật)

Đánh dấu từng dòng; **chưa đủ dấu thì phase chưa đóng.**

**Luồng Google**

- [ ] iOS: bấm "Tiếp tục với Google" → hiện hộp thoại native (không phải tab trình duyệt)
- [ ] iOS: chọn tài khoản → vào thẳng app, đã đăng nhập
- [ ] Android: như trên, **không** `DEVELOPER_ERROR`
- [ ] Huỷ hộp thoại → quay lại màn đăng nhập, **không có thông báo lỗi nào**
- [ ] Tài khoản Google mang **email trùng** một tài khoản mật khẩu sẵn có → vào đúng tài khoản cũ,
      thấy đúng dữ liệu cũ (đường tự liên kết)
- [ ] Tài khoản Google mang email **mới toanh** → tạo tài khoản mới
- [ ] **Người mới**, sau khi đăng nhập Google, **có** thấy màn xin quyền micro (không bị bỏ qua)
- [ ] Giết app rồi mở lại → vẫn đăng nhập (secure-store giữ token)
- [ ] Đăng xuất rồi đăng nhập Google lại → chạy

**Giao diện auth**

- [ ] Màn đăng nhập trên máy nhỏ (SE/compact): bàn phím mở ra, **vẫn cuộn tới được** nút gửi
- [ ] Màn đăng ký: ba ô + bàn phím, nút gửi vẫn tới được
- [ ] Nền peach và wordmark khớp ngôn ngữ thị giác của màn 1–3
- [ ] Dấu G hiển thị sắc nét ở cả `@2x` và `@3x`

**Hồi quy của phase 04 (5 màn ĐÃ nghiệm thu)**

- [ ] Onboarding — nút gradient, bo góc đúng, chạm được
- [ ] Quyền micro — như trên
- [ ] Trang chủ — như trên
- [ ] Đồng ý ghi âm — như trên
- [ ] Cài đặt — như trên
- [ ] Không màn nào lòi góc vuông cam ở bốn góc nút

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| `prebuild` (clean theo mặc định) làm rơi `iosUrlScheme` khỏi Info.plist | **Trung** × Cao | AC #2 bắt được. Đường lùi cộng đồng đề xuất: đặt thêm `ios.infoPlist.CFBundleURLTypes` trong `app.config.ts` — **chưa dùng, đã định giá** |
| `DEVELOPER_ERROR` vì SHA-1 chưa đăng ký | **Cao** × Trung | README nói thẳng, kèm lệnh lấy SHA-1 và cảnh báo bốn chứng chỉ khác nhau |
| Expo 57 dựng Android không đạt `compileSdk >= 35` / `kotlin >= 2.0.21` | Trung × Cao | `make build-app` chứng minh hoặc bác bỏ. Hỏng thì đè trong `app.config.ts` bằng `expo-build-properties` — **chưa cài, là đường lùi** |
| Không thể QA vì chưa có client ID nào | **Chắc chắn** | Đây là điều kiện đã biết. Phase đóng phần tự động; phần QA **treo chờ người dùng**, ghi ở [plan.md](plan.md) |
| QA hồi quy 5 màn bị bỏ qua vì "chỉ đổi cái nút" | Trung × Trung | Danh sách gạch đầu dòng ở trên, không phải một câu dặn dò |
| `pod install` hỏng nhưng `prebuild` vẫn thoát 0 | Trung × Cao | `app-verify` đã kiểm `.xcworkspace` từ trước — không đụng vào |

## Bảo mật

- **Client ID là định danh công khai.** Chúng có trong bundle mobile, trong Info.plist, trong
  `.env.example` — đúng và an toàn. README phải nói thẳng câu này, nếu không sẽ có người "bảo mật"
  nó bằng cách chuyển sang một kho bí mật, và làm hỏng bản dựng native.
- **`.env` thật không bao giờ được commit.** `.gitignore` đã chặn `.env` và `.env.*` trừ
  `.env.example`. Phase này không nới ra.
- **README phải nói rõ `GOOGLE_OAUTH_AUDIENCES` là biên giới bảo mật**, không phải một tuỳ chọn:
  để trống ⇒ đăng nhập Google tắt (fail safe); điền **sai** ⇒ máy chủ chấp nhận token phát cho một
  ứng dụng khác. Đây là lý do `aud` được kiểm, và điền bừa cho "đỡ lỗi" là phá đúng lớp bảo vệ đó.
- QA tay **không** được làm bằng tài khoản Google thật có dữ liệu nhạy cảm. Dùng tài khoản thử.

## Đường lùi

Revert `Makefile` + `README.md` là xong phần tự động. Tắt đăng nhập Google trên một môi trường
đang chạy **không cần deploy**: để trống `GOOGLE_OAUTH_AUDIENCES` rồi khởi động lại API — route từ
chối, log khởi động nói rõ nó đang tắt, mọi thứ khác nguyên vẹn. Mobile chỉ cần bỏ
`EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` rồi `make build-app` là entry plugin biến mất khỏi native.

## Tiếp theo

Phase cuối của đường chính. Còn lại: **12** (cắt được) và mọi mục trong
[Vẫn đang mở](plan.md) — trong đó mục 1 (chưa có client ID) chính là thứ chặn danh sách QA tay ở trên.
