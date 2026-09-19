---
phase: 12
title: "Xóa tài khoản cho người dùng chỉ-Google (cắt được)"
status: completed
priority: P3
effort: 1.5h
blockedBy: [03]
blocks: []
---

# Phase 12 — Xóa tài khoản cho người dùng chỉ-Google

**Liên kết:** [plan.md](plan.md) · [decisions §15](decisions.md) · [file-ownership.md](file-ownership.md) ·
[phase-02](phase-02-nullable-password-and-google-sub.md) ·
[phase-03](phase-03-google-id-token-endpoint.md) · [api-spec §2](../../docs/api-spec.md) ·
[US-05](../../user_stories.md)

> **Phase này CẮT ĐƯỢC.** Cắt thì đường chính vẫn ship được, nhưng người chỉ-Google **không xóa
> được tài khoản của mình**. Đó là một quyết định sản phẩm, không phải kỹ thuật — nên nó là một
> phase riêng, không giấu trong phase khác.

## Tổng quan

`DELETE /users/me` đòi mật khẩu. Người đăng nhập bằng Google **không có** mật khẩu. Phase 02 đã đổi
thông báo từ "Mật khẩu không đúng" (nói dối) thành một lỗi nói rõ lý do (nói thật, nhưng vẫn không
có lối đi). Phase này mở lối đi.

**Đây là regression do chính kế hoạch này tạo ra**, không phải một tính năng đem hoãn. US-05 nói
người dùng xóa được tài khoản và toàn bộ dữ liệu.

## Nhận định then chốt

- **Không có gì phải phát minh.** `GoogleTokenVerifier` của phase 03 đã làm đúng việc cần làm: xác
  minh chữ ký, `iss`, `aud`, `exp`, `email_verified`, và trả về `sub`. Phase này chỉ thêm một luật:
  **`sub` xác minh được phải khớp `users.google_sub` của chính người đang gọi.**
- **Đây là bước xác thực nâng cấp (step-up), không phải đăng nhập.** Người gọi **đã** qua
  `JwtAuthGuard`; ID token ở đây trả lời câu hỏi khác: *"người đang cầm access token có thật sự vẫn
  điều khiển tài khoản Google này không"* — đúng vai mà mật khẩu đang đóng cho tài khoản mật khẩu.
- **Khớp theo `sub`, không theo email.** Một ID token hợp lệ của **người khác** cũng qua được
  `verify()`; thứ chặn nó là so `sub`. Quên bước so này thì bất kỳ ai có một tài khoản Google đều
  xóa được tài khoản của bất kỳ ai khác — biến một bước bảo vệ thành một lỗ thủng.

## Yêu cầu

**Chức năng**

1. `packages/shared/src/users/users.types.ts`:
   ```ts
   /** Đúng MỘT trong hai phải có mặt; máy chủ chọn theo tài khoản có `password_hash` hay không. */
   export interface DeleteMeRequest {
     password?: string;
     google_id_token?: string;
   }
   ```
2. `apps/api/src/users/dto/delete-me.dto.ts`: cả hai `@IsOptional() @IsString() @MinLength(1)`.
   Xác thực "phải có đúng một" nằm ở **service**, không ở DTO — nó phụ thuộc trạng thái tài khoản,
   thứ DTO không biết.
3. `apps/api/src/users/users.service.ts` `deleteMe(userId, dto)`:
   ```
   user = findActiveUserOrFail(userId)
   if (user.password_hash)                      # tài khoản có mật khẩu → giữ nguyên luật cũ
       dto.password thiếu     → VALIDATION_ERROR
       verify sai             → UNAUTHORIZED "Mật khẩu không đúng"
   else                                         # tài khoản chỉ-Google
       dto.google_id_token thiếu → VALIDATION_ERROR, details.google_id_token = ['required_for_google_account']
       claims = verifier.verify(dto.google_id_token)
       claims.sub !== user.google_sub → UNAUTHORIZED "Tài khoản Google không khớp"
   user.deleted_at = now; save
   ```
   `UsersModule` phải import được `GoogleTokenVerifier` — export nó từ `AuthModule`.
4. `docs/api-spec.md` §2: dòng `DELETE /users/me` ghi body
   `{password}` **hoặc** `{google_id_token}`, kèm một câu nói khi nào dùng cái nào.

**Phi chức năng**

- Tài khoản **đã liên kết cả hai** (có `password_hash` **và** `google_sub`) vẫn đi nhánh mật khẩu.
  Cố ý: đó là con đường mạnh hơn, và họ có sẵn. Không làm "chấp nhận cả hai" — thêm một bề mặt cho
  con số 0 giá trị thêm (YAGNI).
- `users.service.ts` giữ dưới 200 dòng; vượt thì tách hàm kiểm credential ra
  `users/delete-credential.ts` **trong cùng phase**.

## File liên quan

Sửa: `packages/shared/src/users/users.types.ts` · `apps/api/src/users/dto/delete-me.dto.ts` ·
`apps/api/src/users/users.service.ts` · `apps/api/src/users/users.service.spec.ts` ·
`apps/api/src/users/users.module.ts` · `apps/api/src/auth/auth.module.ts` (export verifier) ·
`docs/api-spec.md` §2

> `users.service.ts` do phase 02 sở hữu trước; phase 12 ở đợt 3, sau phase 02 ba đợt, **không bao
> giờ chạy song song**. `docs/api-spec.md`: phase 01 sửa §1/§9, phase 12 sửa §2 — khác mục, khác đợt.

## Các bước triển khai

1. Nới `DeleteMeRequest` + DTO.
2. Export `GoogleTokenVerifier` từ `AuthModule`; import vào `UsersModule`.
3. Viết test trước cho cả bốn nhánh từ chối.
4. Sửa `deleteMe`.
5. `openapi:generate`.

## Todo

- [ ] `DeleteMeRequest` hai trường tuỳ chọn
- [ ] `DeleteMeDto`
- [ ] `GoogleTokenVerifier` export/import qua module
- [ ] `deleteMe` phân nhánh theo `password_hash`
- [ ] 6 ca test
- [ ] `docs/api-spec.md` §2

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn test` | thoát 0 |
| 2 | `deleteMe của tài khoản có mật khẩu vẫn đòi mật khẩu` (hồi quy) | pass, **không sửa test cũ** |
| 3 | `deleteMe của tài khoản chỉ-Google chấp nhận google_id_token có sub khớp` | `deleted_at` được đặt |
| 4 | `deleteMe của tài khoản chỉ-Google TỪ CHỐI token có sub khác` | `UNAUTHORIZED`, `deleted_at` **vẫn null** |
| 5 | `deleteMe của tài khoản chỉ-Google từ chối khi thiếu google_id_token` | `VALIDATION_ERROR` với `details.google_id_token = ['required_for_google_account']` |
| 6 | `deleteMe của tài khoản đã liên kết cả hai vẫn đi nhánh mật khẩu` | pass |
| 7 | `deleteMe không bao giờ tin email trong token — chỉ so sub` — token có email trùng nhưng `sub` khác ⇒ **từ chối** | pass |
| 8 | `yarn workspace @meetio/api run openapi:generate` | thoát 0, `DeleteMeDto` có cả hai trường tuỳ chọn |
| 9 | `wc -l apps/api/src/users/users.service.ts` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| **Quên so `sub`** ⇒ bất kỳ ID token Google hợp lệ nào cũng xóa được tài khoản người khác | Trung × **Nghiêm trọng** | AC #4 và AC #7 khoá. Đây là lỗi nguy hiểm nhất trong cả kế hoạch — một `if` thiếu biến bước bảo vệ thành lỗ thủng |
| Nới DTO thành hai trường tuỳ chọn ⇒ gọi **không có trường nào** cũng lọt | Trung × Cao | Service quyết định theo `password_hash`; AC #5 khoá nhánh thiếu |
| Phụ thuộc vòng giữa `UsersModule` và `AuthModule` | Trung × Trung | Chỉ export **`GoogleTokenVerifier`**, không export `GoogleAuthService`. Verifier không phụ thuộc `UsersModule` |
| Cắt phase này rồi quên mất | Trung × Cao | Đã ghi ở [plan.md](plan.md), ở [decisions §15](decisions.md), và trong thông báo lỗi mà phase 02 trả về cho người dùng |

## Bảo mật

- **`sub` là điều kiện cho phép, không phải email.** `verify()` nói "Google đã ký token này cho một
  người nào đó"; chỉ `claims.sub === user.google_sub` mới nói "người đó chính là chủ tài khoản này".
  Bỏ vế thứ hai là mở cửa cho bất kỳ ai có tài khoản Google.
- **Xác thực nâng cấp, không thay thế.** `JwtAuthGuard` vẫn chạy trước. ID token là **lớp thứ hai**,
  đúng vai mật khẩu ở nhánh cũ. Một access token bị trộm vẫn **không** xóa được tài khoản.
- **Xóa mềm, không xóa cứng.** `deleted_at` được đặt; xóa vật lý sau 30 ngày như api-spec §2. Nên kể
  cả khi bước xác thực nâng cấp bị qua mặt, vẫn còn một cửa sổ khôi phục.
- **Không log `google_id_token`**, như mọi chỗ khác trong kế hoạch này.
- `google_sub` **không** bị xoá khi xóa mềm. Cố ý: một tài khoản Google đã dùng cho tài khoản đang
  trong hạn xóa **không** được đăng ký lại làm tài khoản mới — đúng với [decisions §4](decisions.md).

## Đường lùi

`git revert`. `DeleteMeRequest` hẹp lại thành `{ password: string }` là **breaking change** với
client đã gửi `google_id_token` — nhưng client duy nhất là app mobile trong cùng repo, revert cùng
lúc. Không có migration.

## Tiếp theo

Không phase nào phụ thuộc. Còn mở sau phase này: liệu người chỉ-Google có nên **đặt được mật khẩu**
không ([plan.md mục 4](plan.md)) — phase này làm câu hỏi đó **bớt cấp bách**, nhưng không trả lời nó.
