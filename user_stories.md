# Meetio — User Stories

**Dự án:** Meetio — Trợ lý phòng họp AI  
**Nền tảng:** Mobile App (Android & iOS)  
**Cập nhật:** 2026-09-17

**Tài liệu liên quan**
- [Kiến trúc hệ thống](docs/system-architecture.md) — luồng dữ liệu, vòng đời cuộc họp, pipeline AI
- [Mô hình dữ liệu](docs/data-model.md) — schema PostgreSQL, index, entity resolution
- [Đặc tả API](docs/api-spec.md) — REST endpoints, WebSocket events, mã lỗi

---

## 0. Cách đọc tài liệu này

Tài liệu này mô tả **hệ thống làm gì cho người dùng**, không mô tả **làm bằng cách nào** — phần
đó nằm ở ba tài liệu kỹ thuật liên kết bên trên.

- Mỗi story có ID ổn định `US-xx`. ID không bao giờ được tái sử dụng kể cả khi story bị bỏ.
- Acceptance criteria (AC) là điều kiện nghiệm thu — mỗi gạch đầu dòng phải kiểm chứng được bằng
  một thao tác cụ thể. Story không có AC coi như chưa viết xong.
- Các trạng thái hệ thống (`recording`, `processing`, `ready`, `failed`…) dùng đúng tên trong
  [vòng đời cuộc họp](docs/system-architecture.md#1-vòng-đời-cuộc-họp).
- Tài liệu **không phân chia MVP / phase**. Mọi story đều nằm trong phạm vi sản phẩm. Thứ tự thi
  công được quyết định ở bản kế hoạch triển khai, không phải ở đây.

---

## 1. Personas

**P1 — Người dùng (chủ cuộc họp)**  
Người cài app, có tài khoản riêng, dùng điện thoại của mình để ghi lại cuộc họp mà họ tham dự.
Mọi cuộc họp thuộc sở hữu của đúng một P1. Không có chia sẻ, không có vai trò quản trị.
Đây là actor mặc định của mọi story trừ khi ghi khác.

**P2 — Người tham dự cuộc họp**  
Những người khác trong cuộc họp — ngồi cùng phòng, hoặc nói qua cuộc gọi trực tuyến mà điện thoại
thu lại từ loa máy tính. Họ **không dùng app**, không thao tác với hệ thống, nhưng giọng của họ nằm
trong bản ghi. Xuất hiện trong US-04.

**P3 — Hệ thống nền**  
Các tiến trình chạy không có người bấm nút: indexing, embedding, trích xuất đồ thị, gửi thông báo.
Không phải người dùng, nhưng hành vi của nó phải nghiệm thu được nên vẫn có story riêng (E5).

---

## 2. Tổng quan Epic

| Epic | Tên | Stories |
|------|-----|---------|
| E1 | Tài khoản & Quyền riêng tư | US-01 → US-06 |
| E2 | Ghi âm & Nhận diện giọng nói | US-07 → US-16, US-42, US-43 |
| E3 | Dịch song song | US-17 → US-19 |
| E4 | Quản lý cuộc họp | US-20 → US-27 |
| E5 | Pipeline AI & Kết quả | US-28 → US-34 |
| E6 | Đồ thị tri thức & Hỏi đáp | US-35 → US-41 |

Yêu cầu phi chức năng nằm ở mục 4 (`NFR-xx`), không viết dưới dạng story.

---

## 3. Epics

### E1 — Tài khoản & Quyền riêng tư

#### US-01 · Đăng ký tài khoản
Là **P1**, tôi muốn tạo tài khoản bằng email và mật khẩu, để dữ liệu cuộc họp của tôi gắn với
một danh tính và truy cập được từ nhiều thiết bị.

**AC**
- Đăng ký cần email hợp lệ và mật khẩu tối thiểu 8 ký tự; email đã tồn tại thì báo lỗi rõ ràng
  mà không tiết lộ email đó đã đăng ký hay chưa ở màn hình đăng nhập.
- Đăng ký thành công thì tự động đăng nhập luôn, không bắt nhập lại.
- Mật khẩu lưu dạng băm (bcrypt/argon2), không bao giờ lưu hoặc log dạng thô.

#### US-02 · Đăng nhập và duy trì phiên
Là **P1**, tôi muốn giữ trạng thái đăng nhập giữa các lần mở app, để không phải nhập mật khẩu
trước mỗi cuộc họp.

**AC**
- Đăng nhập trả về access token ngắn hạn và refresh token dài hạn; refresh token lưu trong
  secure storage của thiết bị (Keychain / EncryptedSharedPreferences), không lưu trong AsyncStorage thường.
- Given access token hết hạn giữa lúc đang ghi họp, When app gọi API bất kỳ, Then app tự refresh
  và thao tác ghi không bị gián đoạn.
- Refresh token hết hạn hoặc bị thu hồi thì app đưa về màn hình đăng nhập và giữ nguyên dữ liệu
  cuộc họp đang ghi ở local.

#### US-03 · Chỉ truy cập được dữ liệu của chính mình
Là **P1**, tôi muốn chắc chắn không ai đọc hay xóa được cuộc họp của tôi, để nội dung công việc
nhạy cảm không rò rỉ.

**AC**
- Mọi endpoint thao tác trên cuộc họp đều kiểm tra `meeting.user_id` khớp với chủ token; không
  khớp thì trả `404` (không trả `403`, tránh lộ sự tồn tại của tài nguyên).
- Given người dùng A có `meeting_id` của người dùng B, When A gọi `GET`/`PATCH`/`DELETE` trên id đó,
  Then hệ thống trả 404 và ghi log cảnh báo truy cập trái phép.
- WebSocket `join_meeting` cũng kiểm tra quyền sở hữu trước khi cho vào room.
- Có test tự động cho từng endpoint xác nhận hành vi trên (không chỉ kiểm thủ công).

#### US-04 · Thông báo và ghi nhận sự đồng ý ghi âm
Là **P1**, tôi muốn app nhắc tôi về trách nhiệm khi ghi lại một cuộc họp, để buổi ghi minh bạch với
những người đang nói.

**AC**
- Lần đầu bắt đầu một cuộc họp, app hiển thị màn hình giải thích: nội dung sẽ được ghi, chuyển
  thành văn bản và gửi tới dịch vụ AI bên thứ ba để xử lý.
- Màn hình nêu rõ trách nhiệm thông báo cho người tham dự thuộc về người dùng — kể cả khi họ họp
  trực tuyến và app chỉ thu tiếng phát ra từ loa máy tính.
- Người dùng phải xác nhận đã đọc trước khi nút "Bắt đầu" hoạt động.
- Có tùy chọn "Không hiện lại", nhưng mốc thời gian đồng ý vẫn được lưu vào tài khoản.
- Màn hình ghi âm luôn hiển thị chỉ báo đang ghi (chấm đỏ + đồng hồ đếm) trong suốt phiên.

#### US-05 · Xóa tài khoản và toàn bộ dữ liệu
Là **P1**, tôi muốn xóa hẳn tài khoản cùng mọi dữ liệu, để thực hiện quyền xóa dữ liệu cá nhân của mình.

**AC**
- Yêu cầu xóa cần nhập lại mật khẩu để xác nhận.
- Xóa cascade: cuộc họp, transcript, chunk, embedding, thực thể, quan hệ, action item, lịch sử hỏi đáp.
- Hoàn tất trong vòng 30 ngày kể từ lúc yêu cầu; hệ thống xác nhận lại cho người dùng khi xong.
- Sau khi xóa, đăng nhập bằng email cũ được coi như tài khoản mới hoàn toàn.

#### US-06 · Xem và đặt chính sách lưu trữ
Là **P1**, tôi muốn biết dữ liệu của mình được giữ bao lâu và tự đặt thời hạn tự xóa, để kiểm soát
lượng dữ liệu nhạy cảm tồn đọng.

**AC**
- Màn hình cài đặt hiển thị chính sách hiện hành bằng ngôn ngữ thường, không phải điều khoản pháp lý.
- Cho chọn tự xóa cuộc họp sau 30/90/365 ngày hoặc không bao giờ; mặc định là không bao giờ.
- Trước khi tự xóa 7 ngày, hệ thống gửi thông báo để người dùng kịp xuất biên bản.

---

### E2 — Ghi âm & Nhận diện giọng nói

**Bối cảnh dùng chính:** người dùng đang họp trực tuyến trên máy tính. Họ mở app trên điện thoại,
đặt máy cạnh laptop, và app thu tiếng phát ra từ loa. Đây là tình huống app phải làm tốt nhất —
không phải tình huống nhiều người ngồi quanh bàn nói vào điện thoại.

**Hệ quả trực tiếp:** âm thanh vào là **một luồng trộn lẫn**. App không biết ai đang nói và không
gán tên người nói cho bất kỳ câu nào. Transcript chạy liền mạch theo thời gian. Quyết định này chi
phối US-08, US-13, US-23 và US-32.

#### US-07 · Bắt đầu một cuộc họp
Là **P1**, tôi muốn bấm một nút để bắt đầu ghi, để không bỏ lỡ phần mở đầu cuộc họp.

**AC**
- Bấm "Bắt đầu" tạo bản ghi cuộc họp trên server **ngay lập tức** (trạng thái `recording`) và
  trả về `meeting_id` trước khi mic bật.
- Given chưa cấp quyền micro hoặc quyền nhận diện giọng nói, When người dùng bấm Bắt đầu, Then
  app xin quyền; bị từ chối thì hiển thị hướng dẫn mở phần Cài đặt hệ thống thay vì báo lỗi trống.
- Given mất mạng lúc bấm Bắt đầu, When không tạo được bản ghi trên server, Then app vẫn bắt đầu
  ghi ở local và đồng bộ lên server khi có mạng lại (xem US-14).
- Tiêu đề mặc định sinh tự động theo thời gian (ví dụ "Cuộc họp 17/09 14:30"), sửa được sau.

#### US-08 · Xem văn bản hiện ra theo thời gian thực
Là **P1**, tôi muốn thấy lời nói biến thành chữ ngay khi mọi người đang nói, để biết hệ thống
đang hoạt động và bắt được nội dung.

**AC**
- Đoạn văn bản mới xuất hiện trong vòng 2 giây kể từ khi người nói dứt câu.
- Màn hình tự cuộn xuống dòng mới nhất.
- Given người dùng chủ động cuộn ngược lên đọc lại, When có đoạn mới về, Then màn hình **không**
  tự nhảy xuống, mà hiện nút "Xuống dòng mới nhất" kèm số đoạn chưa đọc.
- Văn bản đang được nhận diện dở (partial result) hiển thị khác màu với văn bản đã chốt.

#### US-09 · Tạm dừng và tiếp tục ghi
Là **P1**, tôi muốn tạm dừng khi cuộc họp nghỉ giải lao, để phần nói chuyện riêng không lọt vào biên bản.

**AC**
- Tạm dừng thì mic tắt hẳn, chỉ báo đang ghi đổi sang trạng thái tạm dừng.
- Tiếp tục thì văn bản nối vào đúng chỗ cũ, không tạo cuộc họp mới.
- Khoảng thời gian tạm dừng không tính vào thời lượng cuộc họp.

#### US-10 · Ghi tiếp khi app chạy nền hoặc khóa màn hình
Là **P1**, tôi muốn tắt màn hình hoặc mở app khác mà buổi ghi vẫn chạy, để tiết kiệm pin và vẫn
dùng được điện thoại.

**AC**
- Trên Android: ghi chạy trong foreground service, có notification thường trú kèm nút Kết thúc.
- Trên iOS: bật background audio mode; nếu hệ điều hành vẫn ngắt phiên, app phải phát hiện và
  khởi động lại vòng nhận diện, đồng thời ghi nhận một khoảng gián đoạn vào biên bản.
- Given app bị hệ điều hành kill khi đang chạy nền, When người dùng mở lại app, Then áp dụng US-15.
- Mọi khoảng gián đoạn phải hiện rõ trong transcript (ví dụ "— gián đoạn 12 giây —"), tuyệt đối
  không nối liền hai đoạn như thể không có gì xảy ra.

#### US-11 · Nhận diện liên tục suốt cuộc họp dài
Là **P1**, tôi muốn ghi một cuộc họp 60 phút mà không phải bấm lại giữa chừng, để tập trung vào cuộc họp.

**AC**
- Hệ thống nhận diện chạy liên tục tối thiểu 60 phút không cần thao tác tay.
- Khi engine nhận diện của thiết bị tự ngắt (hết thời lượng cho phép hoặc phát hiện im lặng),
  app tự khởi động lại phiên trong vòng 500ms.
- Mỗi lần khởi động lại được ghi log kèm mốc thời gian để đo tỉ lệ mất chữ.
- **Rủi ro đã biết:** API nhận diện trên thiết bị của cả Android và iOS vốn thiết kế cho câu lệnh
  ngắn, không cho hội thoại dài. Ngưỡng chấp nhận được của story này phải do spike đo thực tế
  quyết định — xem [OQ-01](#5-câu-hỏi-còn-mở).

#### US-12 · Chọn ngôn ngữ nhận diện
Là **P1**, tôi muốn chọn ngôn ngữ đang nói trong cuộc họp, để độ chính xác nhận diện cao nhất.

**AC**
- Chọn ngôn ngữ trước khi bắt đầu; mặc định lấy theo ngôn ngữ hệ thống của thiết bị.
- Ngôn ngữ đã chọn lưu vào bản ghi cuộc họp và dùng lại cho các bước AI phía sau.
- Chỉ liệt kê ngôn ngữ mà thiết bị thực sự hỗ trợ, không hiện lựa chọn rồi báo lỗi sau.

#### US-13 · ~~Gán nhãn người nói~~ — ĐÃ BỎ (2026-09-21)

Bối cảnh dùng chính là điện thoại đặt cạnh laptop thu tiếng từ loa: âm thanh vào là một luồng trộn
lẫn, engine nhận diện trên thiết bị không tách được người nói, và người dùng cũng không thể bấm
chọn người nói cho những người đang họp qua cuộc gọi trực tuyến. Giữ lại tính năng này chỉ tạo ra
một trường dữ liệu gần như luôn trống hoặc sai.

Transcript chạy liền mạch theo thời gian, không gán tên. ID này không được dùng lại.

**Ảnh hưởng:** US-08 và US-23 bỏ phần hiển thị tên người nói · US-32 chỉ suy ra người phụ trách từ
chính nội dung câu nói · màn 06 và 09 trong `design.png` đang vẽ tên kèm avatar và phải sửa lại.

#### US-14 · Không mất dữ liệu khi mạng chập chờn
Là **P1**, tôi muốn mạng rớt giữa cuộc họp mà không mất nội dung, để yên tâm họp ở nơi sóng yếu.

**AC**
- Mỗi đoạn văn bản được ghi vào hàng đợi local trước, rồi mới gửi lên server.
- Server xác nhận từng đoạn bằng `seq`; đoạn chưa được xác nhận sẽ gửi lại khi có mạng.
- Gửi lại cùng một `seq` không tạo bản ghi trùng (idempotent).
- Given mất mạng 10 phút giữa cuộc họp, When mạng có lại, Then toàn bộ đoạn trong 10 phút đó lên
  server đúng thứ tự trong vòng 30 giây.
- Màn hình ghi hiển thị trạng thái đồng bộ (đã đồng bộ / đang chờ N đoạn / mất kết nối).

#### US-15 · Phục hồi cuộc họp sau khi app đóng đột ngột
Là **P1**, tôi muốn app crash mà không mất buổi họp đang ghi, để không phải làm lại từ đầu.

**AC**
- Given cuộc họp ở trạng thái `recording` và app bị kill, When mở lại app, Then màn hình chính
  hiện banner "Có cuộc họp chưa kết thúc" kèm thời điểm bắt đầu.
- Chọn tiếp tục thì mọi đoạn đã lưu (local + server) hiển thị đúng thứ tự và mic ghi tiếp.
- Chọn kết thúc thì cuộc họp chuyển sang `ended` và chạy pipeline AI bình thường.
- Cuộc họp `recording` bị bỏ quên quá 24 giờ sẽ tự chuyển `ended` ở phía server và vẫn được xử lý,
  không bị treo vĩnh viễn.

#### US-16 · Kết thúc cuộc họp
Là **P1**, tôi muốn bấm kết thúc và biết mọi thứ đã an toàn, để rời phòng họp không lo lắng.

**AC**
- Bấm "Kết thúc" chỉ thành công khi mọi đoạn đang chờ đã đồng bộ xong; còn đoạn chờ thì hiện
  tiến trình đồng bộ trước.
- Cuộc họp chuyển `ended` rồi `queued`, và pipeline AI được kích hoạt tự động (US-28).
- Người dùng được đưa về màn hình chi tiết cuộc họp, đọc được transcript ngay mà không cần chờ AI xử lý xong.

#### US-42 · Chọn nguồn âm thanh
Là **P1**, tôi muốn chọn thu bằng micro điện thoại hay bằng thiết bị âm thanh ngoài, để bắt tiếng
rõ nhất trong hoàn cảnh của mình.

**AC**
- Màn hình cài đặt ghi âm có hai lựa chọn: `Micro trên thiết bị` và `Thiết bị ngoài (Bluetooth)`.
- Chọn thiết bị ngoài mà chưa có thiết bị nào kết nối thì hiện hướng dẫn kết nối, không báo lỗi trống.
- Thiết bị ngoài mất kết nối giữa chừng thì app tự chuyển về micro điện thoại, ghi nhận mốc chuyển
  vào transcript, và **không** dừng phiên ghi.
- Lựa chọn gần nhất được nhớ cho phiên sau.

#### US-43 · Chọn chế độ ghi âm
Là **P1**, tôi muốn chọn mức chất lượng ghi, để cân giữa độ chính xác và mức tiêu hao pin.

**AC**
- Có ít nhất hai mức, mặc định là mức được khuyến nghị.
- Mỗi mức nêu rõ đánh đổi bằng ngôn ngữ người dùng hiểu được, không phải thông số kỹ thuật.
- Đổi mức chỉ áp dụng cho phiên sau, không đổi giữa lúc đang ghi.

---

### E3 — Dịch song song

#### US-17 · Bật dịch và chọn ngôn ngữ đích
Là **P1**, tôi muốn bật dịch song song và chọn ngôn ngữ, để theo kịp cuộc họp có người nước ngoài.

**AC**
- Bật/tắt dịch được cả trước và trong lúc họp, không làm gián đoạn việc ghi.
- Chọn ngôn ngữ đích từ danh sách; lựa chọn lưu theo từng cuộc họp, không phải cài đặt toàn cục.
- Bật dịch hiển thị cảnh báo rằng tính năng này phát sinh chi phí xử lý AI theo lượng nội dung.

#### US-18 · Đọc bản dịch ngay bên dưới câu gốc
Là **P1**, tôi muốn thấy bản dịch xuất hiện dưới từng câu, để hiểu nội dung tức thì.

**AC**
- Bản dịch hiện trong vòng 3 giây kể từ khi câu gốc được chốt.
- Câu gốc và bản dịch phân biệt rõ bằng kiểu chữ hoặc màu.
- Given một câu dịch thất bại, When các câu sau vẫn dịch bình thường, Then câu lỗi hiện dấu hiệu
  thử lại được, và cuộc họp không bị dừng.

#### US-19 · Xem lại bản dịch sau cuộc họp
Là **P1**, tôi muốn bản dịch còn nguyên khi mở lại cuộc họp cũ, để chia sẻ cho đồng nghiệp không
nói được ngôn ngữ gốc.

**AC**
- Mỗi đoạn transcript lưu kèm bản dịch và mã ngôn ngữ đích trong cơ sở dữ liệu.
- Màn hình chi tiết cuộc họp có công tắc chuyển giữa ba chế độ: chỉ gốc / chỉ dịch / song song.
- Bản xuất biên bản (US-27) tôn trọng chế độ đang xem.

---

### E4 — Quản lý cuộc họp

#### US-20 · Xem danh sách cuộc họp
Là **P1**, tôi muốn thấy các cuộc họp đã ghi theo thứ tự mới nhất, để tìm lại nhanh.

**AC**
- Danh sách phân trang (mặc định 20 bản ghi/trang), cuộn tới đâu tải tới đó.
- Mỗi dòng hiển thị tiêu đề, ngày giờ, thời lượng và trạng thái xử lý AI.
- Danh sách rỗng hiển thị màn hình hướng dẫn ghi cuộc họp đầu tiên, không phải trang trắng.
- Danh sách tải xong trong 1 giây với 500 cuộc họp.

#### US-21 · Tìm theo tiêu đề và thời gian
Là **P1**, tôi muốn lọc cuộc họp theo tên hoặc khoảng ngày, để thu hẹp kết quả nhanh.

**AC**
- Tìm theo tiêu đề không phân biệt hoa thường và không phân biệt dấu tiếng Việt.
- Lọc theo khoảng ngày kết hợp được với ô tìm kiếm.
- Không có kết quả thì hiện thông báo kèm gợi ý xóa bớt bộ lọc.

#### US-22 · Tìm kiếm ngữ nghĩa xuyên các cuộc họp
Là **P1**, tôi muốn tìm theo ý chứ không theo đúng từ, để tìm được đoạn "bàn về ngân sách quý sau"
dù không ai nói đúng cụm từ đó.

**AC**
- Ô tìm kiếm trả về các đoạn transcript liên quan nhất trên **mọi** cuộc họp của người dùng.
- Mỗi kết quả hiện đoạn trích, tên cuộc họp, thời điểm, và bấm vào nhảy đúng tới vị trí đó.
- Kết quả trả về trong 2 giây với kho 500 cuộc họp.
- Tìm kiếm chỉ chạy trên dữ liệu của chính người dùng (US-03).

#### US-23 · Đọc lại toàn văn cuộc họp
Là **P1**, tôi muốn xem đầy đủ nội dung đã ghi, để kiểm chứng những gì AI tóm tắt.

**AC**
- Transcript hiển thị theo đoạn, kèm mốc thời gian tính từ lúc bắt đầu. Không có tên người nói (xem US-13).
- Cuộc họp dài 2 giờ vẫn cuộn mượt (dùng danh sách ảo hóa).
- Có nút nhảy nhanh tới đầu / cuối / vị trí đọc dở lần trước.

#### US-24 · Sửa nội dung nhận diện sai
Là **P1**, tôi muốn sửa những chỗ máy nghe nhầm, nhất là thuật ngữ chuyên ngành và tên riêng, để
biên bản và kết quả AI chính xác.

**AC**
- Sửa được từng đoạn tại chỗ; đoạn đã sửa có dấu hiệu nhận biết.
- Given người dùng sửa một hoặc nhiều đoạn, When họ lưu, Then app hỏi rõ có chạy lại phân tích AI
  không, kèm cảnh báo việc này tốn thời gian và chi phí.
- Chọn chạy lại thì chỉ xử lý lại các chunk bị ảnh hưởng, không làm lại toàn bộ cuộc họp.
- Trong lúc chạy lại, tóm tắt và hỏi đáp cũ vẫn dùng được, kèm nhãn "đang cập nhật".

#### US-25 · Đổi tiêu đề cuộc họp
Là **P1**, tôi muốn đặt tên dễ nhớ cho cuộc họp, để tìm lại sau này.

**AC**
- Sửa tiêu đề ngay trên màn hình chi tiết, lưu tự động.
- Tiêu đề rỗng thì quay về tên mặc định theo thời gian, không cho lưu chuỗi trắng.

#### US-26 · Xóa cuộc họp
Là **P1**, tôi muốn xóa hẳn một cuộc họp, để nội dung nhạy cảm không còn tồn tại.

**AC**
- Xóa cần xác nhận, có nêu rõ sẽ mất transcript, tóm tắt và dữ liệu hỏi đáp.
- Xóa cascade cả chunk, embedding, quan hệ, action item và lịch sử hỏi đáp của cuộc họp đó.
- Thực thể chỉ xuất hiện trong duy nhất cuộc họp này cũng bị xóa; thực thể còn xuất hiện ở cuộc
  họp khác thì giữ lại và chỉ gỡ liên kết (xem [data-model](docs/data-model.md)).
- Có khoảng hoàn tác 10 giây ngay trên màn hình trước khi lệnh xóa thực sự gửi đi.

#### US-27 · Xuất và chia sẻ biên bản
Là **P1**, tôi muốn xuất biên bản ra file, để gửi cho đồng nghiệp không dùng app.

**AC**
- Xuất được Markdown và PDF, gồm tiêu đề, thời gian, tóm tắt, action items và toàn văn.
- Chọn được thành phần muốn đưa vào bản xuất.
- Dùng cơ chế chia sẻ sẵn có của hệ điều hành; file không đi qua bất kỳ nơi lưu trữ công khai nào.
- Cuộc họp chưa xử lý xong vẫn xuất được phần transcript, kèm ghi chú tóm tắt chưa sẵn sàng.

---

### E5 — Pipeline AI & Kết quả

#### US-28 · Thấy rõ trạng thái xử lý
Là **P1**, tôi muốn biết AI đang làm đến đâu sau khi họp xong, để không phải đoán xem app có treo không.

**AC**
- Màn hình chi tiết hiển thị đúng một trong các trạng thái: `queued`, `processing`, `ready`, `failed`.
- Trạng thái cập nhật realtime, không cần kéo xuống làm mới thủ công.
- `processing` hiển thị bước đang chạy (cắt đoạn / nhúng vector / trích xuất đồ thị / tóm tắt).
- `failed` hiển thị lý do bằng ngôn ngữ người dùng hiểu được, kèm nút thử lại (US-29).

#### US-29 · Thử lại khi xử lý thất bại
Là **P1**, tôi muốn chạy lại phân tích khi nó lỗi, để không mất công cuộc họp đã ghi.

**AC**
- Hệ thống tự thử lại tối đa 3 lần với khoảng chờ tăng dần trước khi báo `failed`.
- Người dùng bấm thử lại thủ công được; lần chạy lại bỏ qua các bước đã hoàn tất thành công.
- Mọi lần thất bại ghi lại thông điệp lỗi và bước bị lỗi để phục vụ điều tra.
- Transcript **không bao giờ** bị mất vì lỗi ở tầng AI.

#### US-30 · Nhận thông báo khi phân tích xong
Là **P1**, tôi muốn được báo khi bản tóm tắt sẵn sàng, để quay lại đọc mà không phải mở app canh chừng.

**AC**
- App đang mở: nhận qua kênh realtime, giao diện tự cập nhật.
- App đóng: nhận push notification, chạm vào mở thẳng cuộc họp đó.
- Chỉ gửi một thông báo cho mỗi cuộc họp, kể cả khi có thử lại nhiều lần.
- Tắt thông báo được trong phần cài đặt.

#### US-31 · Đọc bản tóm tắt điều hành
Là **P1**, tôi muốn nắm nội dung chính trong một phút, để không phải đọc lại toàn bộ biên bản.

**AC**
- Tóm tắt gồm các ý chính và các quyết định đã chốt, viết bằng ngôn ngữ của cuộc họp.
- Mỗi ý trong tóm tắt dẫn được về đoạn transcript nguồn.
- Cuộc họp quá ngắn hoặc không đủ nội dung thì nói thẳng điều đó, không bịa ra tóm tắt.

#### US-32 · Xem danh sách việc cần làm
Là **P1**, tôi muốn thấy các đầu việc phát sinh trong cuộc họp, để không quên cam kết.

**AC**
- Mỗi action item có nội dung, người phụ trách (nếu xác định được), hạn chót (nếu có nhắc tới)
  và đoạn transcript nguồn.
- Không xác định được người phụ trách thì để trống, không gán bừa.
- Sửa nội dung, người phụ trách và hạn chót bằng tay được.
- Thêm action item thủ công được cho những việc AI bỏ sót.

#### US-33 · Đánh dấu việc đã hoàn thành
Là **P1**, tôi muốn tick những việc đã xong, để theo dõi tiến độ sau cuộc họp.

**AC**
- Mỗi action item có hai trạng thái: chưa xong / đã xong.
- Việc đã xong chuyển xuống cuối danh sách, vẫn xem lại được.
- Trạng thái đồng bộ giữa các thiết bị của cùng tài khoản.

#### US-34 · Xem việc cần làm của mình xuyên các cuộc họp
Là **P1**, tôi muốn tập hợp mọi đầu việc đang mở từ tất cả cuộc họp vào một chỗ, để biết mình đang nợ gì.

**AC**
- Có màn hình tổng hợp mọi action item chưa xong của người dùng.
- Lọc được theo người phụ trách và theo cuộc họp.
- Mỗi mục dẫn được về cuộc họp gốc.

---

### E6 — Đồ thị tri thức & Hỏi đáp

#### US-35 · Hỏi đáp trong một cuộc họp
Là **P1**, tôi muốn hỏi bằng câu chữ bình thường về nội dung một cuộc họp, để lấy chi tiết mà
không phải đọc lại toàn bộ.

**AC**
- Mỗi cuộc họp có khung chat riêng, giữ lại lịch sử hỏi đáp.
- Câu trả lời xuất hiện trong 5 giây với cuộc họp dài tối đa 2 giờ.
- Hệ thống hiểu được câu hỏi tham chiếu tới câu trước ("còn việc kia thì sao?").
- Nội dung cuộc họp không chứa câu trả lời thì nói thẳng là không tìm thấy, **tuyệt đối không bịa**.

#### US-36 · Câu trả lời luôn kèm nguồn trích dẫn
Là **P1**, tôi muốn biết AI lấy thông tin từ chỗ nào trong cuộc họp, để tự kiểm chứng.

**AC**
- Mỗi câu trả lời kèm tối thiểu một trích dẫn trỏ về đoạn transcript cụ thể.
- Chạm vào trích dẫn thì nhảy tới đúng đoạn đó trong transcript.
- Trả lời được nhưng không có nguồn chắc chắn thì phải nêu rõ mức độ không chắc chắn.

#### US-37 · Hỏi đáp xuyên nhiều cuộc họp
Là **P1**, tôi muốn hỏi những câu vắt qua nhiều buổi họp, ví dụ "dự án ABC đã thay đổi thế nào
trong tháng này", để nhìn được diễn tiến.

**AC**
- Có khung hỏi đáp toàn cục, không gắn với một cuộc họp cụ thể.
- Câu trả lời trích dẫn nguồn từ nhiều cuộc họp khác nhau, mỗi trích dẫn ghi rõ tên và ngày họp.
- Có lọc theo khoảng thời gian trước khi hỏi.
- Chỉ dùng dữ liệu của chính người dùng (US-03).

#### US-38 · Xem đồ thị thực thể và quan hệ
Là **P1**, tôi muốn nhìn thấy những người, dự án và chủ đề mà hệ thống rút ra được, để kiểm tra
AI có hiểu đúng không.

**AC**
- Có màn hình liệt kê thực thể theo loại (người / dự án / chủ đề / tổ chức).
- Chọn một thực thể thì thấy các quan hệ của nó và những cuộc họp có nhắc tới.
- Mỗi quan hệ dẫn được về đoạn transcript sinh ra nó.

#### US-39 · Theo dõi một thực thể qua thời gian
Là **P1**, tôi muốn xem "dự án ABC" được nhắc tới ra sao qua từng cuộc họp, để nắm diễn tiến.

**AC**
- Trang chi tiết thực thể hiển thị dòng thời gian các lần được nhắc, xếp theo thứ tự thời gian.
- Mỗi mốc gồm tên cuộc họp, ngày và đoạn trích liên quan.
- Đặt câu hỏi giới hạn trong phạm vi thực thể đó ngay tại màn hình này được.

#### US-40 · Gộp các thực thể bị trùng
Là **P1**, tôi muốn gộp "Anh Bình", "Bình" và "anh Bình" thành một, để đồ thị không bị loãng.

**AC**
- Hệ thống tự đề xuất các thực thể nghi ngờ trùng dựa trên độ tương đồng tên và ngữ cảnh.
- Người dùng xác nhận gộp hoặc bác bỏ; bác bỏ rồi thì không đề xuất lại cặp đó nữa.
- Gộp xong, mọi quan hệ và lần nhắc dồn về thực thể chuẩn; tên cũ giữ lại làm bí danh và vẫn
  tìm kiếm ra được.
- Tách lại thực thể vừa gộp nhầm được trong vòng 30 ngày.

#### US-41 · Sửa thực thể sai
Là **P1**, tôi muốn sửa tên hoặc loại của thực thể bị nhận diện sai, để đồ thị phản ánh đúng thực tế.

**AC**
- Sửa được tên hiển thị và loại của thực thể.
- Xóa hẳn thực thể rác được; xóa thì gỡ luôn các quan hệ gắn với nó.
- Sửa tay rồi thì các lần chạy pipeline sau không ghi đè lên chỉnh sửa đó.

---

## 4. Yêu cầu phi chức năng (NFR)

| ID | Nhóm | Yêu cầu |
|----|------|---------|
| NFR-01 | Quyền riêng tư | Nội dung cuộc họp là dữ liệu cá nhân theo Nghị định 13/2023. Phải có chính sách rõ ràng về thu thập, xử lý, lưu trữ và xóa; người dùng đồng ý trước khi gửi dữ liệu sang dịch vụ AI bên thứ ba. |
| NFR-02 | Quyền riêng tư | Không gửi audio thô ra khỏi thiết bị ở phương án nhận diện trên thiết bị. Nếu sau này chuyển sang nhận diện đám mây, phải coi là thay đổi lớn về chính sách và xin đồng ý lại. |
| NFR-03 | Bảo mật | Mã hóa toàn tuyến (TLS) cho mọi kết nối HTTP và WebSocket. Token lưu trong secure storage của thiết bị. |
| NFR-04 | Bảo mật | Không ghi log nội dung transcript, câu hỏi hỏi đáp hay prompt gửi LLM ở môi trường production. |
| NFR-05 | Hiệu năng | Độ trễ hiển thị văn bản: dưới 2 giây kể từ khi dứt câu. Dịch: dưới 3 giây. Trả lời hỏi đáp: dưới 5 giây. |
| NFR-06 | Hiệu năng | Hoàn tất pipeline AI cho cuộc họp 60 phút trong vòng 5 phút kể từ lúc kết thúc. |
| NFR-07 | Chi phí | Có hạn mức chi phí AI theo từng người dùng và cảnh báo khi gần chạm ngưỡng. Ghi nhận lượng token tiêu thụ theo từng cuộc họp. |
| NFR-08 | Chi phí | Dịch song song và trích xuất đồ thị gom theo lô để giảm số lần gọi API. |
| NFR-09 | Độ tin cậy | Transcript không bao giờ mất vì lỗi ở tầng AI hay tầng hạ tầng. Ghi vào nơi lưu trữ bền vững trước khi xử lý. |
| NFR-10 | Độ tin cậy | Mọi tác vụ nền đều idempotent và thử lại được mà không sinh dữ liệu trùng. |
| NFR-11 | Khả năng quan sát | Ghi log có cấu trúc cho từng bước pipeline kèm `meeting_id`, thời lượng, lượng token và kết quả. |
| NFR-12 | Khả dụng | Hoạt động được với tiếng Việt, gồm tìm kiếm không dấu và hiển thị dấu đúng trên mọi phông chữ. |
| NFR-13 | Tương thích | Android 8.0 trở lên, iOS 16.4 trở lên. (Sửa 27/09/2026 từ iOS 15: Expo SDK 57 mà app dùng yêu cầu tối thiểu iOS 16.4.) |

---

## 5. Câu hỏi còn mở

| ID | Câu hỏi | Vì sao chặn |
|----|---------|-------------|
| OQ-01 | Engine nhận diện trên thiết bị chịu được cuộc họp dài bao nhiêu phút, và mất bao nhiêu phần trăm chữ ở mỗi lần khởi động lại? | Quyết định US-11 có khả thi không. Nếu không đạt, phải chuyển sang nhận diện đám mây — kéo theo thay đổi NFR-02, mô hình chi phí và cả luồng dữ liệu. **Cần spike đo thực tế trước khi thi công E2.** |
| OQ-02 | Chỉ dựa vào nội dung câu nói, không có tên người nói, thì US-32 gán đúng người phụ trách được bao nhiêu phần trăm? | Quá thấp thì phải bỏ hẳn cột người phụ trách khỏi action item, thay vì giữ một trường gần như luôn trống. |
| OQ-05 | Thu tiếng phát ra từ loa laptop ở khoảng cách 30–50cm thì tỉ lệ nhận diện sai là bao nhiêu? | Đây là bối cảnh dùng chính của sản phẩm và khó hơn hẳn nói trực tiếp vào máy. WER quá cao thì mọi thứ phía sau — dịch, tóm tắt, đồ thị — đều vô dụng theo. |
| OQ-03 | Ngưỡng tương đồng nào để tự đề xuất gộp thực thể (US-40)? | Đặt thấp thì gộp nhầm, đặt cao thì đồ thị đầy bản trùng. Cần dữ liệu thật để hiệu chỉnh. |
| OQ-04 | Hạn mức chi phí AI mỗi người dùng mỗi tháng là bao nhiêu? | Chi phối NFR-07 và quyết định dịch song song có bật mặc định hay không. |
