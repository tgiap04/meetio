---
phase: 01
title: "Hợp đồng kiểu + mã lỗi"
status: completed
priority: P1
effort: 1h
blockedBy: []
blocks: [03, 09]
---

# Phase 01 — Hợp đồng kiểu + mã lỗi

**Liên kết:** [plan.md](plan.md) · [decisions §8 (hai mã lỗi)](decisions.md) ·
[file-ownership.md](file-ownership.md) · [api-spec §1/§9](../../docs/api-spec.md)

## Tổng quan

Chốt **hợp đồng trên dây** trước khi hai đầu dây bắt đầu. Phase này không có logic nào — nó chỉ làm
cho `apps/api` và `apps/mobile` không thể nói lệch nhau về hình dạng request và tên mã lỗi.

Nhỏ (1h) nhưng đứng riêng vì **hai phase khác đều chặn ở đây** (03 và 09), và vì nó là phase duy
nhất chạm `packages/shared` — nơi CI có cổng khóa cứng.

## Nhận định then chốt

- **Không có kiểu response mới.** `POST /auth/google` trả **đúng `AuthTokenPair`** mà
  `/auth/register` và `/auth/login` đang trả. Đây là điều kiện để mobile dùng lại `persistSession`
  không sửa một dòng. Đẻ ra `GoogleAuthResponse` riêng là tạo hai đường lưu token — thứ
  [file-ownership](file-ownership.md) cấm tường minh.
- **`error-messages.ts` khai `Record<ApiErrorCode, string>` đầy đủ khóa.** Thêm mã vào shared mà
  không thêm câu tiếng Việt ⇒ **`yarn typecheck` đỏ ở mobile**. Đó là lý do một phase sở hữu cả hai
  file, không tách.
- `packages/shared` **chỉ có kiểu, 0 runtime dependency** — CI job
  `assert-shared-has-no-runtime-deps` chặn. Phase này không `yarn add` gì cả.

## Yêu cầu

**Chức năng**

1. `packages/shared/src/auth/auth.types.ts` thêm:
   ```ts
   /** `POST /auth/google` — ID token lấy từ SDK Google trên máy.
    *  Máy chủ **không bao giờ** nhận email hay user id từ client; mọi sự thật
    *  về danh tính suy ra từ token đã xác minh (xem phase-03 §Bảo mật). */
   export interface GoogleSignInRequest {
     id_token: string;
   }
   ```
   **Đúng một trường.** Response dùng lại `AuthTokenPair`, không khai thêm.
2. `packages/shared/src/enums/api-error-code.ts` thêm hai khóa:
   `GOOGLE_TOKEN_INVALID`, `GOOGLE_EMAIL_UNVERIFIED`.
3. `apps/mobile/src/api/error-messages.ts` thêm hai câu:
   - `GOOGLE_TOKEN_INVALID` → `'Đăng nhập Google thất bại, vui lòng thử lại.'`
   - `GOOGLE_EMAIL_UNVERIFIED` → `'Tài khoản Google này chưa xác minh email. Hãy xác minh email với Google rồi thử lại.'`
   Câu thứ hai **phải nói được việc cần làm**, vì bấm lại không giải quyết gì (decisions §8).
4. `docs/api-spec.md`:
   - §1 thêm dòng: `POST /auth/google` · Body `{id_token}` → `{access_token, refresh_token, user}`,
     kèm một câu: liên kết tự động theo email **chỉ khi** `email_verified` là true.
   - §9 thêm hai dòng mã lỗi với HTTP 401.

**Phi chức năng**

- `packages/shared/package.json` giữ `dependencies` rỗng — không sửa file đó.
- Không đụng `api-exception.filter.ts`: hai mã mới **ném tường minh** từ tầng nghiệp vụ, bộ lọc vẫn
  không được đoán mã theo HTTP status (api-spec §9).

## Luồng dữ liệu

```
mobile  ──{ id_token }──►  POST /auth/google  ──►  { access_token, refresh_token, user }
   ▲                                                          │
   └── getErrorMessage(err) ◄── { error: { code, message } } ◄─┘  (401 khi hỏng)
```

Cả hai chiều đều nói bằng kiểu của `@meetio/shared`. Không nơi nào khai lại hình dạng.

## Các bước triển khai

1. Thêm `GoogleSignInRequest` vào `auth.types.ts` (giữ nguyên thứ tự và giọng comment sẵn có).
2. Thêm hai khóa vào `ApiErrorCode`, đặt **sau** `TOKEN_EXPIRED` để nhóm auth nằm liền nhau.
3. Chạy `yarn typecheck` — mobile **phải đỏ** ở `error-messages.ts`. Đỏ đúng chỗ là bằng chứng
   ràng buộc exhaustive đang hoạt động.
4. Thêm hai câu vào `FALLBACK_MESSAGES`, chạy lại `yarn typecheck` → xanh.
5. Thêm ca test vào `error-messages.test.ts` cho hai mã mới.
6. Cập nhật `docs/api-spec.md` §1 và §9.

## Todo

- [ ] `GoogleSignInRequest` trong `packages/shared/src/auth/auth.types.ts`
- [ ] Hai mã trong `packages/shared/src/enums/api-error-code.ts`
- [ ] Hai câu trong `apps/mobile/src/api/error-messages.ts`
- [ ] Ca test trong `apps/mobile/src/api/error-messages.test.ts`
- [ ] `docs/api-spec.md` §1 + §9

## Tiêu chí nghiệm thu (quan sát được)

| # | Lệnh / test | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck` | thoát 0 |
| 2 | `yarn lint` | thoát 0 (chạy `--max-warnings=0`) |
| 3 | `yarn test` | thoát 0, không test nào đang xanh bị đỏ |
| 4 | test tên `getErrorMessage trả câu hướng dẫn xác minh email cho GOOGLE_EMAIL_UNVERIFIED` | pass |
| 5 | `node -e "const p=require('./packages/shared/package.json');process.exit(Object.keys(p.dependencies\|\|{}).length)"` | thoát 0 (đúng cổng CI) |
| 6 | `grep -c 'auth/google' docs/api-spec.md` | `>= 1` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Ai đó "sửa" lỗi biên dịch bằng cách nới `Record<ApiErrorCode,string>` thành `Partial<...>` | Thấp × Cao | Ghi thẳng ở đây: **ràng buộc exhaustive là tính năng**, không phải phiền toái. Nới ra là mất luôn cái chuông báo |
| Đẻ thêm `GoogleAuthResponse` "cho rõ ràng" | Trung × Cao | Cấm tường minh ở [file-ownership](file-ownership.md); hệ quả là hai đường lưu token trong app |

## Bảo mật

- `GoogleSignInRequest` **cố ý chỉ có một trường**. `ValidationPipe` toàn cục đang bật
  `whitelist: true` (`main.ts:20`), nên client có gửi kèm `email` hay `sub` thì cũng **bị cắt trước
  khi DTO được đọc**. Hợp đồng hẹp là lớp phòng thủ đầu tiên, trước cả code xác minh.
- Câu tiếng Việt của `GOOGLE_EMAIL_UNVERIFIED` **không được** nói tài khoản đó có tồn tại trong
  Meetio hay không. Nó chỉ nói về trạng thái *bên Google*.

## Đường lùi

`git revert` một commit. Không có migration, không có dependency, không có trạng thái nào tồn tại
sau khi revert. Phase 03 và 09 chưa khởi công thì không ai phụ thuộc.

## Tiếp theo

Mở khóa **03** (server) và **09** (mobile). Hai phase đó chạy song song được vì không chung file nào.
