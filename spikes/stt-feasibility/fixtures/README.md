# Âm thanh mẫu & bản chép tay đối chiếu

Thư mục này **không commit** file âm thanh hay bản chép tay (`.gitignore` chặn sẵn) — phase-00 · Bảo mật:
âm thanh mẫu không chứa nội dung kinh doanh thật, và log/bản ghi không rời máy người đo.

## Âm thanh mẫu (`meeting-60min.wav` hoặc `.m4a`)

- Dài **60 phút**, là **cuộc họp tiếng Việt thật** (không phải đọc văn bản), **nhiều người nói**,
  có **xen thuật ngữ tiếng Anh** như cuộc họp kỹ thuật bình thường ("deploy", "deadline", "API"...).
- Nội dung **không** chứa thông tin kinh doanh thật — dùng một buổi họp nội bộ đã được đồng ý ghi,
  hoặc dựng lại một cuộc họp giả lập với người thật nói tự nhiên.
- Có tiếng ồn nền tự nhiên của phòng họp / cuộc gọi trực tuyến; đừng làm sạch — sản phẩm phải chịu được.
- **Một file duy nhất cho mọi lượt đo** — đổi file giữa chừng là mất khả năng so giữa các máy.

## Bản chép tay (`reference.txt`)

Chép tay chính xác từng chữ đã nói, mỗi dòng một câu/đoạn, mở đầu bằng mốc thời gian tính từ
**giây 0 của file âm thanh**:

```
# Họp sprint review — bản chép tay đối chiếu
[00:00:04] chào mọi người mình bắt đầu họp nhé
[00:00:09] hôm nay mình review lại tiến độ sprint này
[00:00:15] bên backend đã deploy xong API đăng nhập
```

- Mốc `[mm:ss]` hoặc `[hh:mm:ss]`, không lùi. Dòng `#` là chú thích.
- **Không** ghi tên người nói — hệ thống không dùng tới (US-13 đã bỏ).
- Ghi thuật ngữ tiếng Anh đúng như người nói phát âm ra chữ ("deploy", không phải "đi-ploi").
- Dấu câu, hoa thường không quan trọng — công cụ phân tích bỏ đi trước khi so.
- Mốc càng dày (mỗi câu một dòng) thì con số "chữ mất mỗi lần restart" càng chính xác, vì chữ
  trong một dòng được rải đều theo thời gian.
