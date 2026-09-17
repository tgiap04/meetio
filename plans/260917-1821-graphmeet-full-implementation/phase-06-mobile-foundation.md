# Phase 06 · Nền tảng mobile

**Liên kết:** [plan.md](plan.md) · [US-02](../../user_stories.md#us-02--đăng-nhập-và-duy-trì-phiên) ·
[US-04](../../user_stories.md#us-04--thông-báo-và-ghi-nhận-sự-đồng-ý-ghi-âm)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 03

Bộ khung app: điều hướng, client API, lưu trữ an toàn, luồng xác thực, màn hình đồng ý ghi âm.

## Nhận định then chốt
- Refresh token phải nằm trong Keychain (iOS) / EncryptedSharedPreferences (Android). AsyncStorage
  là bộ nhớ trần — để token ở đó là mở cửa cho bất kỳ app nào đọc được sandbox.
- Tự refresh token phải im lặng và không bao giờ làm gián đoạn phiên ghi đang chạy — token hết hạn
  giữa cuộc họp là tình huống thường, không phải ngoại lệ.
- Màn hình đồng ý ghi âm là yêu cầu pháp lý, không phải màn hình chào mừng. Nó chặn nút Bắt đầu.

## Yêu cầu
**Chức năng:** đăng ký, đăng nhập, tự refresh, đăng xuất; điều hướng có phân nhánh theo trạng thái
đăng nhập; client API tập trung; màn hình đồng ý; màn hình cài đặt (lưu trữ, thông báo, xóa tài khoản).
**Phi chức năng:** khởi động lạnh dưới 2 giây; hoạt động tốt với tiếng Việt có dấu.

## Kiến trúc
Expo Router với hai nhóm route: `(auth)` và `(app)`. TanStack Query cho trạng thái từ server,
Zustand cho trạng thái phiên ghi cục bộ.

Client API là một lớp bọc `fetch` có interceptor: gắn access token, bắt `401 TOKEN_EXPIRED`, refresh
một lần rồi thử lại. Các request đồng thời cùng gặp 401 phải dùng chung **một** lượt refresh duy
nhất — không thì sẽ có nhiều lượt xoay vòng token đá nhau.

## File liên quan
**Tạo:** `apps/mobile/app/(auth)/` · `apps/mobile/app/(app)/` · `apps/mobile/src/api/client.ts` ·
`src/api/auth.ts` · `src/store/session.ts` · `src/storage/secure-store.ts` ·
`src/components/` (nút, ô nhập, trạng thái rỗng, trạng thái lỗi) · `src/theme/`

## Các bước thực hiện
1. Bố cục Expo Router, phân nhánh theo trạng thái đăng nhập.
2. `secure-store.ts` bọc `expo-secure-store` để lưu và đọc token.
3. Client API + interceptor refresh, gom các lượt refresh đồng thời về một.
4. Màn hình đăng ký / đăng nhập, xử lý lỗi theo bảng mã ở [api-spec §9](../../docs/api-spec.md#9-mã-lỗi).
5. Màn hình đồng ý ghi âm: giải thích dữ liệu đi đâu, gọi `POST /users/me/consent`.
6. Màn hình cài đặt: hồ sơ, chính sách lưu trữ, bật/tắt thông báo, xóa tài khoản.
7. Bộ component dùng chung: trạng thái tải, trạng thái rỗng, trạng thái lỗi có nút thử lại.
8. Chọn phông chữ hiển thị đúng đủ dấu tiếng Việt, kiểm trên cả hai nền tảng.

## Todo
- [ ] Bố cục Expo Router + phân nhánh xác thực
- [ ] Lưu trữ an toàn cho token
- [ ] Client API + interceptor refresh gom lượt
- [ ] Màn hình đăng ký / đăng nhập
- [ ] Màn hình đồng ý ghi âm
- [ ] Màn hình cài đặt (lưu trữ, thông báo, xóa tài khoản)
- [ ] Bộ component trạng thái dùng chung
- [ ] Kiểm hiển thị tiếng Việt trên cả hai nền tảng

## Chuẩn hoàn thành
- Đăng nhập rồi đóng app, mở lại vẫn ở trạng thái đăng nhập.
- Access token hết hạn được refresh im lặng, người dùng không thấy gì.
- Ba request đồng thời cùng gặp 401 chỉ tạo ra một lượt refresh.
- Không thể vào nhóm route `(app)` khi chưa đăng nhập.
- Nút Bắt đầu bị khóa cho tới khi người dùng xác nhận đồng ý ghi âm.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Nhiều lượt refresh đồng thời đá nhau | Gom về một promise dùng chung, có test cho tình huống đua |
| Phông chữ thiếu dấu tiếng Việt | Kiểm bộ ký tự trước khi chốt phông |

## Bảo mật
Token chỉ nằm trong secure storage. Không log token, không log nội dung phản hồi API ở bản phát hành.

## Tiếp theo
Mở khóa Phase 07 (ghi âm) và Phase 10 (màn hình quản lý cuộc họp).
