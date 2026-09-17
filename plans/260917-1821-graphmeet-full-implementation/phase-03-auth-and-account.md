# Phase 03 · Xác thực & tài khoản

**Liên kết:** [plan.md](plan.md) · [US-01→06](../../user_stories.md#e1--tài-khoản--quyền-riêng-tư) ·
[api-spec §1–2](../../docs/api-spec.md#1-xác-thực)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 02

Xác thực, phân quyền theo chủ sở hữu, đồng ý ghi âm, xóa tài khoản và chính sách lưu trữ.

## Nhận định then chốt
- Bản đặc tả gốc không có khái niệm chủ sở hữu — mọi endpoint đều là lỗ hổng IDOR. Phase này là chỗ
  bịt lại, và phải bịt ở **tầng truy vấn**, không phải ở tầng controller.
- Trả 404 thay vì 403 cho tài nguyên không thuộc sở hữu: 403 tự nó đã tiết lộ tài nguyên đó tồn tại.
- Xóa tài khoản là quyền pháp lý ([NĐ 13/2023](../../user_stories.md#4-yêu-cầu-phi-chức-năng-nfr)),
  không phải tính năng cho vui — phải thực sự xóa được.

## Yêu cầu
**Chức năng:** đăng ký, đăng nhập, xoay vòng refresh token, thu hồi, hồ sơ, đồng ý ghi âm, chính
sách lưu trữ, xóa tài khoản có thời gian ân hạn.
**Phi chức năng:** băm mật khẩu bằng argon2id; access token 15 phút, refresh 60 ngày; giới hạn 10
lần/phút/IP cho nhóm `/auth/*`.

## Kiến trúc
Module `AuthModule` + `UsersModule`. Chiến lược JWT của Passport cho access token; refresh token lưu
dạng băm trong bảng riêng và **xoay vòng mỗi lần dùng** (dùng lại token cũ → thu hồi cả chuỗi).

Phân quyền theo chủ sở hữu hiện thực bằng một lớp repository cơ sở: mọi truy vấn cuộc họp bắt buộc
nhận `userId` làm tham số. Không có đường nào truy vấn mà quên lọc, vì chữ ký hàm không cho phép.

## File liên quan
**Tạo:** `apps/api/src/auth/` (module, service, controller, chiến lược, guard) ·
`apps/api/src/users/` · `apps/api/src/common/guards/ownership.guard.ts` ·
`apps/api/src/common/repositories/scoped.repository.ts` ·
`apps/api/src/jobs/account-deletion.job.ts`

## Các bước thực hiện
1. `AuthService`: đăng ký, đăng nhập, refresh có xoay vòng, đăng xuất. Băm argon2id.
2. Chiến lược JWT + `JwtAuthGuard` gắn toàn cục, trừ nhóm `/auth/*`.
3. `ScopedRepository`: lớp cơ sở ép mọi truy vấn mang `userId`; các module sau kế thừa từ đây.
4. Bộ lọc ngoại lệ chuyển lỗi quyền sở hữu thành `404 MEETING_NOT_FOUND`, đồng thời ghi log cảnh báo.
5. `UsersController`: xem/sửa hồ sơ, ghi nhận đồng ý, đặt `retention_days`.
6. Xóa tài khoản: xác nhận mật khẩu → đặt `deleted_at` → chặn đăng nhập ngay lập tức.
7. Tác vụ định kỳ: xóa vật lý tài khoản quá 30 ngày; xóa cuộc họp quá hạn lưu trữ, báo trước 7 ngày.
8. Giới hạn tần suất cho `/auth/*` bằng `@nestjs/throttler` với kho đếm trên Redis.
9. Viết test bảo mật: người dùng A thao tác trên tài nguyên của B phải nhận 404 ở **mọi** endpoint.

## Todo
- [ ] Đăng ký / đăng nhập / refresh có xoay vòng / đăng xuất
- [ ] JwtAuthGuard toàn cục
- [ ] ScopedRepository ép lọc theo chủ sở hữu
- [ ] Bộ lọc ngoại lệ trả 404 thay vì 403
- [ ] Hồ sơ, đồng ý ghi âm, chính sách lưu trữ
- [ ] Xóa tài khoản + tác vụ xóa vật lý sau 30 ngày
- [ ] Tác vụ áp dụng hạn lưu trữ, thông báo trước 7 ngày
- [ ] Giới hạn tần suất /auth/*
- [ ] Bộ test IDOR cho toàn bộ endpoint

## Chuẩn hoàn thành
- Toàn bộ endpoint ở [api-spec §1–2](../../docs/api-spec.md#1-xác-thực) hoạt động đúng đặc tả.
- Bộ test IDOR xanh: mọi endpoint nhận `meeting_id` của người khác đều trả 404.
- Dùng lại một refresh token đã xoay vòng làm thu hồi toàn bộ chuỗi token đó.
- Xóa tài khoản rồi thì đăng nhập thất bại ngay, và sau 30 ngày không còn dòng dữ liệu nào.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Module sau quên dùng ScopedRepository | Quy tắc lint cấm gọi thẳng Prisma client ngoài lớp repository |
| Refresh token bị đánh cắp | Xoay vòng + phát hiện dùng lại → thu hồi cả chuỗi |
| Xóa tài khoản không dọn hết dữ liệu | Test đếm số dòng còn lại trên mọi bảng sau khi xóa |

## Bảo mật
Đây **là** phase bảo mật của dự án. Không ghi log mật khẩu, token hay mã băm. Thông điệp lỗi đăng
nhập không được tiết lộ email đã tồn tại hay chưa.

## Tiếp theo
Mở khóa Phase 04 (API cuộc họp) và Phase 06 (nền tảng mobile).
