---
title: "Đăng nhập Google + dựng lại màn Đăng nhập / Đăng ký"
description: "Thêm POST /auth/google xác minh ID token phía máy chủ, tự liên kết tài khoản theo email đã xác minh, và dựng lại hai màn auth theo ngôn ngữ thị giác của màn 1–3."
status: completed
priority: P1
effort: 24.5h
branch: main
tags: [auth, google-oauth, mobile, api, migration, ui]
created: 2026-09-19
completed: 2026-09-20
---

# Đăng nhập Google + màn auth

Lối đăng nhập thứ hai bên cạnh email/mật khẩu **đã chạy thật**, và dựng lại hai màn
`(auth)/login` + `(auth)/register` — hiện là form trần, không nền, không nhận diện.

**Nguồn:** [Báo cáo stack](../reports/researcher-2026-09-19-google-signin-stack.md) ·
[api-spec §1/§9/§10](../../docs/api-spec.md) · [data-model §1](../../docs/data-model.md) ·
[Kế hoạch màn 1–3](../260918-0033-mobile-splash-onboarding-permission/plan.md) ·
**[Quyết định](decisions.md)** · **[Sở hữu file](file-ownership.md)**

**Nền đã có:** argon2id + xoay vòng refresh + thu hồi cả họ · `persistSession` · `ScreenBackdrop`,
`AppMark`, `BrandFill`, `BrandedParagraph`, `TextField`, `PrimaryButton`. Endpoint mới trả **đúng
`AuthTokenPair` cũ** ⇒ mobile dùng lại `persistSession`, không sửa dòng nào.

> **`design.png` KHÔNG có màn đăng nhập/đăng ký** — 13 màn, đánh số 1–10 và 12–14, không màn nào là
> auth. Hai màn này **thiết kế mới**, dẫn xuất từ màn 1–3 đã dựng ([decisions §9](decisions.md)).

## Các phase — tất cả hoàn tất

| # | Phase | Nhánh | Phụ thuộc | Effort | Status |
|---|-------|-------|-----------|--------|--------|
| 00 | [`EXPO_PUBLIC_*` tới được bundle **(lỗi có sẵn)**](phase-00-expo-public-env-reaches-the-bundle.md) | — | — | 1h | ✓ |
| 01 | [Hợp đồng kiểu + mã lỗi](phase-01-shared-contract-and-error-codes.md) | B | — | 1h | ✓ |
| 02 | [Schema: `password_hash` nullable + `google_sub`](phase-02-nullable-password-and-google-sub.md) | B | — | 2.5h | ✓ |
| 03 | [Xác minh ID token + `POST /auth/google`](phase-03-google-id-token-endpoint.md) | B | 01, 02 | 3.5h | ✓ |
| 04 | [`PrimaryButton` chuyển gradient](phase-04-primary-button-gradient.md) | A | — | 1h | ✓ |
| 05 | [Khung màn auth + nút Google](phase-05-auth-chrome-and-google-button.md) | A | — | 2h | ✓ |
| 06 | [Thân form Đăng nhập](phase-06-login-form-body.md) | A | 04, 05 | 2h | ✓ |
| 07 | [Thân form Đăng ký](phase-07-register-form-body.md) | A | 04, 05 | 1.5h | ✓ |
| 08 | [Thư viện google-signin + bọc native + mock Jest](phase-08-google-signin-library-and-native-wrapper.md) | C | — | 2.5h | ✓ |
| 09 | [`useGoogleSignIn` + `api/auth.ts`](phase-09-google-sign-in-hook.md) | C | 01, 08 | 1.5h | ✓ |
| 10 | [Nối dây hai route auth](phase-10-auth-route-wiring.md) | C | 06, 07, 09 | 2h | ✓ |
| 11 | [Env + README + dựng native + QA máy thật](phase-11-env-readme-native-rebuild-qa.md) | C | 00, 03, 08, 10 | 2.5h | ⊙ |
| 12 | [Xóa tài khoản cho người chỉ-Google **(P3, cắt được)**](phase-12-google-only-account-deletion.md) | B | 03 | 1.5h | ✓ |

**Phase 11** (QA máy thật — in-device manual testing) **không thể hoàn tất tự động**; đã để mở theo đúng tiền lệ của phase 08 trong kế hoạch trước.

**Song song:** `00∥01∥02∥04∥05∥08` → `03∥06∥07∥09` → `10∥12` → `11`. **Nhánh A (UI) không phụ thuộc
nhánh B (backend) theo chiều nào** — đọc cột "Phụ thuộc" là kiểm được. [file-ownership.md](file-ownership.md).

## Bốn quyết định chi phối

1. **Khóa nối là `sub` của Google, không bao giờ là email.** Email đổi được; `sub` thì không.
2. **Tự liên kết CHỈ khi `email_verified === true`**, cổng chạy **trước** mọi truy vấn theo email —
   nếu không, token chưa xác minh vẫn dò được email nào tồn tại ([phase-03 §Bảo mật](phase-03-google-id-token-endpoint.md)).
3. **Nhánh A thuần trình bày, nối dây ở nhánh C** — tiền lệ `permission.tsx` + `permission-body.tsx`.
4. **Không thêm cột `provider`**: suy ra được từ hai cột nullable ([decisions §2](decisions.md)).

## Rủi ro chi phối

| Rủi ro | Khả năng × Tác động | Đối sách | Phase |
|--------|---------------------|----------|-------|
| `expo prebuild` **mặc định clean** (đã kiểm `clean: !args['--no-clean']`) ⇒ `iosUrlScheme` có thể không lọt vào Info.plist | Trung × Cao | `app-verify` **grep** Info.plist tìm reversed client ID; bỏ qua sạch khi chưa cấu hình | 11 |
| `EXPO_PUBLIC_*` **chưa từng tới được bundle** — `@expo/env` không đi ngược lên gốc repo; `babel-preset-expo` nội tuyến `undefined`. **Đã đo, là lỗi có sẵn**, `apiClient.baseURL` hỏng từ trước | **Đã xác nhận** × Cao | [Phase 00](phase-00-expo-public-env-reaches-the-bundle.md): `make env` sinh thêm `apps/mobile/.env` chỉ gồm khoá `EXPO_PUBLIC_*`, kèm script kiểm không đậu oan được | 00 |
| Mock Jest của google-signin **không nằm trong `exports`** (đã kiểm: chỉ `.`, `./app.plugin.js`, `./package.json`) | Cao × Trung | Xác lập bằng thực nghiệm; lùi về `jest.mock()` tại chỗ hoặc `jest.setup.ts` | 08 |
| `password_hash` nullable ⇒ login mật khẩu của tài khoản chỉ-Google **không tốn chi phí argon2** ⇒ lộ "đây là tài khoản Google" qua thời gian phản hồi | Cao × Trung | Đốt đúng chi phí `timingSafetyHash`; test so tỉ lệ thời gian | 02 |
| `DELETE /users/me` đòi mật khẩu ⇒ người chỉ-Google **không xóa được tài khoản** (US-05) | Chắc chắn × Cao | 02 báo lỗi rõ thay vì "sai mật khẩu"; 12 mở lối xóa bằng ID token | 02, 12 |
| Đổi `PrimaryButton` chạm 5 màn **đã nghiệm thu**; hai request Google đồng thời va `UNIQUE` | Trung × Trung | Test cũ xanh nguyên + QA lại 5 màn; bắt `23505` rồi đọc lại | 04·11, 03 |

## Vẫn đang mở (không phase nào đóng được)

1. **Chưa có OAuth client ID nào trên Google Cloud.** Vòng đi-về thật với Google **chúng ta không
   kiểm được** — bước nghiệm thu trên máy người dùng, ghi ở phase 11. **SHA-1 Android (debug +
   release)** cũng phải tự đăng ký trong Google Cloud Console — thao tác tay.
2. **Chưa xác nhận** Expo 57 dựng Android mặc định có đạt `compileSdk >= 35` / `kotlin >= 2.0.21`
   hay không — `make build-app` ở phase 11 sẽ chứng minh hoặc bác bỏ.
3. **Người chỉ-Google có nên đặt được mật khẩu về sau không** (khôi phục) — ngoài phạm vi.
4. **Không có luồng "quên mật khẩu" nào cả.** Ngoài phạm vi, nhưng phải ghi: quyết định tự-liên-kết
   đứng được một phần vì người dùng không bị kẹt ngoài cửa.
5. **Không kiểm `nonce`** — thư viện không cấp nonce cho luồng này ([phase-03 §Bảo mật](phase-03-google-id-token-endpoint.md)).

## Plan Defects Found During Forge

Những sai sót trong văn bản kế hoạch (không phải trong code) đã xác nhận lúc xây dựng. Chức năng đúng; văn bản cần sửa:

1. **phase-08 AC #10** — `grep -rln "@react-native-google-signin" ... → đúng một file` không thể đúng khi file bọc có cả `.test.ts` cùng thư mục, vì test phải `jest.mock()` thư viện để kiểm soát nhánh. Yêu cầu chức năng (không màn nào import trực tiếp) **đúng**. Cần sửa grep: `--include='*.ts' --exclude='*.test.ts'` để loại test file.

2. **phase-06 testing note** — "không mock gì" là không đạt được. `LoginForm` tự gắn `DevResetButton` thực, mà nó import `expo-router`, một cái `standard-navigation` của expo-router ship chưa transpile ESM mà Jest không parse được. `dev-reset-button.test.tsx` đã mock nó; `login-form.test.tsx` cũng phải mock vì cùng lý do. Cần sửa ghi chú thành "test import `expo-router` → jest.mock nó".

3. **file-ownership.md** — mục "Không được đụng" cho `apps/mobile/src/hooks/use-auth-mutations.ts` quá chặt. Phase 09 phải thêm `export` vào `persistSession` để tái sử dụng; không thì chỉ còn cách sao chép logic, đúng là điều cấm. Giá trị như nó là: "Một **hành vi** của hook vẫn nguyên, chỉ tầm nhìn thay đổi để reuse." Sửa văn bản để rõ ràng **thay đổi hành vi** bị cấm, không phải thay đổi **visibility**.

4. **phase-12 file list** — cột "Sửa file đã có" thiếu ba file: `users.module.ts`, `auth.module.ts`, `users.controller.ts` — tất cả ba đều trong phase's implementation steps. Danh sách không đầy đủ nhưng không xung đột sở hữu (không ai khác chạm chúng).

5. **phase-12 §Yêu cầu #3** — pseudocode đường phân nhánh không nêu: "nếu request gửi CẢ `password` lẫn `google_id_token` thì sao?" Lựa chọn duy nhất là kiểm "đúng một". Phần code thực thêm `checkExactlyOneDeleteCredential` guard. Văn bản cần ghi rõ bộ kiểm này.

6. **phase-07 AC #2** — "gọi onSubmit với đủ ba giá trị" đọc như thể callback nhận argument, trong khi contract là `onSubmit: () => void`. Chỉ để lại text; code giữ đúng contract.

7. **phase-03 AC #14** — "gọi lại refresh/family-revocation regression surface" trích từ phase 02, mà phase 02's suite đã cover. Phase 03 không sở hữu file nào có khả năng hồi quy bản đó. Tiêu chí này trùng lặp; xoá.

## Risk Analysis Corrections

Hai điều đã nâng từ rủi ro → hiện trạng đã đo:

1. **Phase 00 risk** — "`EXPO_PUBLIC_*` chưa từng tới bundle" — **đã xác nhận là lỗi có sẵn**, không phải rủi ro. Đã xây dựng Phase 00 để sửa nó. Ghi phía trên: **Risk closed** ✓ — chứng minh `@expo/env.load('apps/mobile')` không đi ngược lên, và `babel-preset-expo` dưới `NODE_ENV=production` nội tuyến `undefined` trước sửa, giá trị thực sau sửa.

2. **`expo prebuild` risk** — plan nói "có thể không clean". Thực tế: Expo mặc định **luôn** clean (`clean: !args['--no-clean']` trong `@expo/cli`). Plan **đã** được sửa; confirm nó đúng. **Risk downgrade** ✓ → Low impact.

## Follow-Up Work (Không Fix, Chỉ Record)

Ba item mở ra từ quá trình xây dựng; không giải quyết ở đây:

1. **`jest.config.cjs` có lỗi ESM-interop tiềm ẩn:** Import bất kỳ `.ts` cục bộ nào có module graph kết hợp `@nestjs/throttler` + một `@nestjs/*` package thứ hai → `Cannot require() ES Module @nestjs/common in a cycle` từ jest-runtime's cycle guard. Reproducible, không fix bằng mock. Phase 03 làm workaround cho một file bằng spawn `node --import tsx` child; đo đạc mutation test chứng minh nó genuinely bites. Bất kỳ controller-level spec tương lai nào cũng sẽ hit.

2. **Không có `SafeAreaProvider` ở `app/_layout.tsx`** — react-native-safe-area-context không dùng được, màn hình không tính inset. Pre-existing, app-wide. Ảnh hưởng: back chevron trên permission screen ngồi dưới notch.

3. **`typography.ts` không set `lineHeight` trên token nào** — tiếng Việt stack diacritics clip ở font size lớn trên accessibility mode. Phase 05 viết scale-aware helper cục bộ cho một subtitle; nó thuộc theme cho toàn app. Pre-existing, app-wide, low priority.
