# Chính sách quyền riêng tư của Meetio

Phiên bản đồng ý: 2 · Cập nhật: 27/09/2026

> **Cần bổ sung trước khi phát hành:** tên pháp lý của bên kiểm soát dữ liệu, địa chỉ, email liên hệ về dữ liệu cá
> nhân, và nơi đặt máy chủ. Các mục này để trống có chủ đích — không được điền thông tin phỏng đoán.
> **Điều kiện phát hành:** mục 6 khẳng định mọi kết nối dùng TLS — chỉ công bố bản này khi máy chủ production đã chỉ
> nhận HTTPS và app trỏ tới địa chỉ `https://` (NFR-03, chưa triển khai tại thời điểm viết).

Meetio giúp bạn ghi lại, chép lời, tóm tắt và hỏi đáp về các cuộc họp. Chính sách này nói rõ Meetio thu thập dữ liệu
gì, đưa dữ liệu đi đâu, giữ trong bao lâu và bạn có những quyền gì, theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá
nhân.

## 1. Dữ liệu Meetio thu thập

- **Tài khoản:** email, tên hiển thị, mật khẩu (chỉ lưu dạng băm) hoặc định danh tài khoản Google nếu bạn đăng nhập
  bằng Google.
- **Nội dung cuộc họp:** bản chép lời (văn bản) do điện thoại của bạn tạo ra, tiêu đề, thời gian và thời lượng cuộc họp,
  những chỉnh sửa bạn làm trên bản chép lời.
- **Kết quả AI:** tóm tắt, việc cần làm, các thực thể và quan hệ (người, dự án, chủ đề…) rút ra từ cuộc họp, lịch sử
  hỏi đáp của bạn.
- **Thiết bị:** mã nhận thông báo đẩy (push token) nếu bạn cho phép thông báo.
- **Mức sử dụng:** số token AI mỗi lượt xử lý, để tính hạn mức và chi phí.

## 2. Âm thanh không rời khỏi điện thoại

Việc nhận diện giọng nói chạy **trên điện thoại** của bạn. Meetio không ghi lại và không gửi tệp âm thanh lên máy chủ;
chỉ văn bản đã chép lời được gửi đi. Nếu sau này Meetio chuyển sang nhận diện trên máy chủ, đó là thay đổi lớn về
chính sách và Meetio sẽ xin bạn đồng ý lại trước.

## 3. Dữ liệu được gửi đi đâu

| Nơi nhận | Dữ liệu | Để làm gì |
|---|---|---|
| Máy chủ Meetio | Bản chép lời, tài khoản, kết quả AI, lịch sử hỏi đáp | Lưu trữ, đồng bộ giữa các thiết bị, tìm kiếm |
| Google (Gemini API) | Văn bản bản chép lời, câu hỏi của bạn | Chia đoạn và tạo vector tìm kiếm, rút thực thể, tóm tắt, trả lời câu hỏi |
| Expo (dịch vụ thông báo đẩy) | Mã thiết bị và một thông báo chung chung | Báo khi cuộc họp xử lý xong hoặc sắp bị xóa theo hạn lưu trữ. Thông báo không chứa tiêu đề hay nội dung cuộc họp |

Meetio không bán dữ liệu của bạn và không dùng nội dung cuộc họp để quảng cáo.

## 4. Thời gian lưu trữ

- Cuộc họp được giữ cho tới khi bạn xóa, hoặc tới hạn lưu trữ bạn chọn trong **Cài đặt** (số ngày tính từ lúc cuộc họp
  kết thúc). Trước hạn 7 ngày, Meetio gửi một thông báo nhắc; đến hạn, cuộc họp bị xóa hẳn cùng mọi dữ liệu gắn với nó.
- Xóa một cuộc họp là xóa hẳn: bản chép lời, tóm tắt, việc cần làm, lịch sử hỏi đáp của cuộc họp đó, và những thực thể
  không còn được nhắc ở cuộc họp nào khác.
- Xóa tài khoản: đăng nhập bị chặn ngay; toàn bộ dữ liệu bị xóa hẳn sau 30 ngày.

## 5. Quyền của bạn

Theo Nghị định 13/2023/NĐ-CP, bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, truy cập, chỉnh sửa, xóa dữ liệu,
hạn chế xử lý và phản đối việc xử lý. Trong ứng dụng, bạn có thể xem và sửa bản chép lời, xóa từng cuộc họp, đặt hạn
lưu trữ, tắt thông báo và xóa tài khoản. Rút lại sự đồng ý nghĩa là ngừng ghi và xử lý cuộc họp mới; bạn có thể xóa
các cuộc họp đã có.

## 6. Bảo mật

Mọi kết nối tới máy chủ dùng mã hóa TLS. Mã đăng nhập được lưu trong vùng lưu trữ an toàn của điện thoại. Máy chủ chỉ
cho mỗi người đọc dữ liệu của chính mình. Nội dung bản chép lời, câu hỏi và câu trả lời không được ghi vào nhật ký hệ
thống.

## 7. Đồng ý

Trước lần ghi đầu tiên, và mỗi khi nội dung đồng ý thay đổi, Meetio hỏi bạn đồng ý với việc xử lý nêu trên. Không đồng
ý thì bạn không thể ghi cuộc họp mới.
