---
phase: 02
title: "Schema: password_hash nullable + google_sub"
status: completed
priority: P1
effort: 2.5h
blockedBy: []
blocks: [03]
---

# Phase 02 — `password_hash` nullable + `google_sub`

**Liên kết:** [plan.md](plan.md) · [decisions §2 (không có cột `provider`)](decisions.md) ·
[decisions §15 (xóa tài khoản)](decisions.md) · [decisions §16 (đối xứng thời gian)](decisions.md) ·
[file-ownership.md](file-ownership.md) · [data-model §1](../../docs/data-model.md)

## Tổng quan

Mở schema cho một tài khoản **không có mật khẩu**, rồi đi sửa **cả hai** chỗ trong code đang cho
rằng mật khẩu luôn tồn tại. Trình biên dịch sẽ chỉ ra cả hai chỗ đó — đây là phase mà TypeScript làm
việc thay cho một cuộc rà soát bằng mắt.

Phase này **không** biết gì về Google ngoài cái tên cột. Nó chạy song song với 01/04/05/08.

## Nhận định then chốt

- **Hai chỗ đọc `password_hash`**, tìm bằng `grep`, không phải bằng trí nhớ:
  `auth.service.ts:68` (`login`) và `users.service.ts:65` (`deleteMe`). Cả hai sẽ **không biên dịch
  được** ngay khi entity đổi sang `string | null`. Không có chỗ thứ ba.
- **`argon2.verify(null, …)` KHÔNG ném 500** — đã chạy thật:
  `Promise` bị **reject** với `TypeError: pchstr must be a non-empty string`, và `.catch(() => false)`
  ở dòng 68 bắt được. Lỗi thật là **oracle thời gian**, không phải lỗi 500 (decisions §16).
- **`schema.integration.spec.ts` sẽ chạy `down()` của migration mới.** Ca
  `reverts the last migration and reapplies it` gọi `undoLastMigration()`, mà sau phase này
  migration cuối **chính là 010**. Nên `down()` không phải code trang trí — nó chạy trong CI mỗi lần.
- Postgres coi các `NULL` là **khác nhau** trong `UNIQUE`, nên một unique index thường trên
  `google_sub` đã cho phép vô số hàng chưa liên kết. Không cần partial index (KISS).

## Yêu cầu

**Chức năng**

1. Migration `1758000000010-AddGoogleIdentityToUsers.ts`:
   - `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`
   - `ADD COLUMN google_sub TEXT NULL`
   - `CREATE UNIQUE INDEX idx_users_google_sub ON users (google_sub)`
   - `ADD CONSTRAINT chk_users_has_credential CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)`
   - `down()` theo **thứ tự ngược**: drop constraint → drop index → drop column → khôi phục
     `SET NOT NULL`. **Trước khi** `SET NOT NULL`, đếm hàng `password_hash IS NULL`; còn hàng thì
     **ném lỗi có thông điệp rõ**, không âm thầm xóa và không âm thầm bỏ qua.
2. `user.entity.ts`:
   - `@Column({ name: 'password_hash', type: 'text', nullable: true }) password_hash!: string | null;`
   - `@Index('idx_users_google_sub', { unique: true }) @Column({ name: 'google_sub', type: 'text', nullable: true }) google_sub!: string | null;`
3. `auth.service.ts`:
   - `login()` chốt null **và trả đúng chi phí argon2** (xem §Kiến trúc).
   - `issueTokenPairWithUser` đổi `private` → `public` — **seam phase 03 tiêu thụ**. Thêm comment
     nói rõ vì sao nó public: để đường Google dùng **cùng một** bộ phát token, không đẻ đường thứ hai.
4. `users.service.ts` `deleteMe()`: `password_hash` null ⇒ ném `BadRequestException` với
   `code: VALIDATION_ERROR`, `details: { password: ['not_set_for_google_account'] }` và message
   tiếng Việt nói rõ đây là tài khoản Google. **Không** trả "Mật khẩu không đúng" — nói dối với
   chính chủ tài khoản đã xác thực thì không được gì (decisions §15).
5. `docs/data-model.md` bảng `users`: `password_hash` ghi `NULL khi tài khoản chỉ đăng nhập Google`,
   thêm dòng `google_sub`, ghi `CHECK`.

**Phi chức năng**

- `synchronize: false` vĩnh viễn — mọi thay đổi schema đi qua migration đánh số.
- Mỗi file dưới 200 dòng. `auth.service.ts` sau phase này ~175 dòng; đó là lý do phase 03 **không**
  được nhét thêm vào đây.

## Kiến trúc — đối xứng thời gian ở `login()`

Ba tình huống thất bại phải **không phân biệt được từ bên ngoài**, cả về nội dung lẫn về thời gian:

| Tình huống | Hôm nay | Sau phase này |
|---|---|---|
| Email không tồn tại | `verify(timingSafetyHash, …)` | không đổi |
| Sai mật khẩu | `verify(hash thật, …)` | không đổi |
| **Tài khoản chỉ-Google** | reject ngay, **0 chi phí** | `verify(timingSafetyHash, …)` |

Hình dạng (không phải code cuối cùng — implementer viết theo văn phong file):

```
user = findOne(email, deleted_at IS NULL)
if (!user)               → burnTimingSafetyCost(); throw invalidCredentials()
if (!user.password_hash) → burnTimingSafetyCost(); throw invalidCredentials()   ← mới
if (!verify(hash, pw))   → throw invalidCredentials()
```

`burnTimingSafetyCost()` gói đúng lời gọi `argon2.verify(await this.timingSafetyHash, …)` đang có ở
dòng 64 — **rút ra một chỗ, gọi ở hai nơi** (DRY), không phải cơ chế mới.

`invalidCredentials()` là **một hàm duy nhất** ⇒ ba nhánh trả về cùng `code` và cùng message. Đây là
thứ giữ cho oracle không sống lại khi ai đó "cải thiện thông báo lỗi" về sau.

## File liên quan

Sửa: `apps/api/src/database/entities/user.entity.ts` · `apps/api/src/auth/auth.service.ts` ·
`apps/api/src/auth/auth.service.spec.ts` · `apps/api/src/users/users.service.ts` ·
`apps/api/src/users/users.service.spec.ts` ·
`apps/api/src/database/__tests__/schema.integration.spec.ts` · `docs/data-model.md`
Tạo: `apps/api/src/database/migrations/1758000000010-AddGoogleIdentityToUsers.ts`

## Các bước triển khai

1. Viết migration 010 (`up` + `down`), theo đúng văn phong `...009` (dùng `TableColumn`,
   `TableIndex`, `queryRunner.query` cho `CHECK`).
2. Đổi `user.entity.ts`. Chạy `yarn workspace @meetio/api run typecheck` → **phải đỏ ở đúng 2 chỗ**.
   Ghi lại hai chỗ đó; đỏ ở chỗ thứ ba nghĩa là `grep` ban đầu sót.
3. Rút `burnTimingSafetyCost()` ra khỏi nhánh "email không tồn tại", rồi dùng nó cho nhánh mới.
4. Đổi `issueTokenPairWithUser` thành `public`, thêm comment về seam.
5. Sửa `deleteMe()`.
6. Viết test (xem bảng nghiệm thu) trước khi coi là xong.
7. `make up && yarn workspace @meetio/api run migration:run` rồi `migration:revert` rồi
   `migration:run` lại — bằng tay, một vòng, trước khi tin vào CI.
8. Cập nhật `docs/data-model.md`.

## Todo

- [ ] Migration 010 `up()`
- [ ] Migration 010 `down()` — có chốt "còn hàng chỉ-Google thì từ chối"
- [ ] `user.entity.ts`
- [ ] `burnTimingSafetyCost()` + chốt null ở `login()`
- [ ] `issueTokenPairWithUser` → `public` + comment
- [ ] `deleteMe()` báo lỗi rõ
- [ ] Test: 3 tình huống login đồng nhất về code/message
- [ ] Test: tỉ lệ thời gian chỉ-Google vs sai-mật-khẩu
- [ ] Test: `deleteMe` của người chỉ-Google
- [ ] Test tích hợp: `down()` từ chối khi còn hàng chỉ-Google
- [ ] `docs/data-model.md`

## Tiêu chí nghiệm thu (quan sát được)

| # | Lệnh / test | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint` | thoát 0 |
| 2 | `yarn workspace @meetio/api run migration:run` rồi `migration:revert` rồi `migration:run` | cả ba thoát 0 |
| 3 | `psql -c "\d users"` | `password_hash` không còn `not null`; có `google_sub`; có `idx_users_google_sub` (UNIQUE); có `chk_users_has_credential` |
| 4 | `psql -c "INSERT INTO users (email, display_name) VALUES ('x@y.z','X')"` | **thất bại** vì vi phạm `chk_users_has_credential` |
| 5 | test `login trả cùng code và cùng message cho: email lạ, sai mật khẩu, tài khoản chỉ-Google` | pass |
| 6 | test `login của tài khoản chỉ-Google vẫn trả chi phí argon2` — đo `performance.now()`, khẳng định `t_googleOnly > 0.5 * t_wrongPassword` | pass. Ngưỡng 0,5 không mong manh: khoảng cách thật là ~100ms so với <1ms |
| 7 | test `deleteMe của tài khoản chỉ-Google ném VALIDATION_ERROR với details.password = ['not_set_for_google_account']` | pass |
| 8 | test tích hợp `down() từ chối khi users còn hàng password_hash IS NULL` (chèn 1 hàng chỉ-Google → `undoLastMigration()` phải reject → dọn hàng) | pass |
| 9 | `DATABASE_URL=… yarn workspace @meetio/api run test` | ca `reverts the last migration and reapplies it` **vẫn pass** |
| 10 | `wc -l apps/api/src/auth/auth.service.ts` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| `down()` không khôi phục được `NOT NULL` vì đã có hàng chỉ-Google ⇒ migration kẹt một chiều | Trung × Cao | `down()` **ném lỗi có chỉ dẫn** thay vì xóa dữ liệu. Muốn lùi thật thì phải quyết số phận các tài khoản đó trước — đó là quyết định của con người, không phải của migration |
| Ca revert trong `schema.integration.spec.ts` gãy vì thứ tự drop sai | Trung × Trung | Drop constraint → index → column. Có AC #9 khóa |
| "Cải thiện" thông báo lỗi làm ba nhánh login khác nhau ⇒ oracle sống lại | Trung × Cao | AC #5 khóa sự đồng nhất; comment tại `invalidCredentials()` nói vì sao |
| Ai đó bỏ test thời gian vì "flaky" | Trung × Trung | Ngưỡng 0,5 với khoảng cách hai bậc độ lớn. Nếu thật sự flaky thì nghĩa là chi phí argon2 đã biến mất — đúng thứ cần biết |
| `seed.ts` vỡ vì entity đổi | Thấp × Thấp | `seed.ts` đặt `password_hash` giá trị thật; `string` vẫn gán được vào `string \| null` |

## Bảo mật

- **Không liệt kê được tài khoản.** Ba nhánh thất bại của `login()` giống nhau về `code`, về
  `message`, và (nhờ `burnTimingSafetyCost`) về chi phí tính toán. Người ngoài không phân biệt được
  "email này chưa đăng ký", "sai mật khẩu" và "tài khoản này đăng nhập bằng Google".
- **`deleteMe` thì được phép nói thật.** Route đó nằm sau `JwtAuthGuard`; người gọi là chủ tài khoản
  đã xác thực, họ đã biết họ đăng nhập bằng gì. Che ở đây chỉ làm họ bối rối, không chặn được ai.
- **`CHECK` là biện pháp bảo mật, không phải dọn dẹp.** Một hàng `users` không có lối vào nào là một
  hàng không ai đăng nhập được và cũng không ai xóa được qua sản phẩm — dữ liệu cá nhân mắc kẹt,
  đi ngược US-05.
- `password_hash` vẫn **không bao giờ** rời tiến trình: `toPublicUser()` là cửa duy nhất và nó không
  có trường đó. Phase này không đụng vào `PublicUserDto`.

## Đường lùi

`yarn workspace @meetio/api run migration:revert` + `git revert`. **Điều kiện:** chưa có tài khoản
chỉ-Google nào — tức là lùi được sạch cho tới khi phase 03 lên production. Sau đó, đường lùi là
"vô hiệu hóa route `/auth/google`" (một dòng) chứ **không phải** lùi schema; lùi schema lúc đó cần
một quyết định về các tài khoản đã tạo.

## Tiếp theo

Mở khóa **03**. Seam bàn giao: `AuthService.issueTokenPairWithUser` (public) và hai trường nullable
trên `User`.
