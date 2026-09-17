# Phase 10 · Quản lý cuộc họp & xuất bản

**Liên kết:** [plan.md](plan.md) · [US-20,21,23→27](../../user_stories.md#e4--quản-lý-cuộc-họp)

## Tổng quan
**Ưu tiên:** Trung bình · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 04, 06

Danh sách, tìm kiếm theo tiêu đề, đọc lại, sửa transcript, đổi tên, xóa, xuất biên bản.
(Tìm kiếm ngữ nghĩa thuộc Phase 12.)

## Nhận định then chốt
- Sửa transcript kéo theo chạy lại pipeline — phải nói rõ cho người dùng biết là tốn thời gian và
  tiền, rồi mới hỏi có chạy không. Bản đặc tả gốc ghi "nếu cần" mà không định nghĩa.
- Chỉ chạy lại các chunk chứa đoạn bị sửa, cộng bước tóm tắt. Chạy lại toàn bộ là đốt tiền vô ích.
- Tìm kiếm tiêu đề tiếng Việt phải bỏ dấu — người ta gõ "hop sprint" và vẫn phải ra "họp sprint".
- Trong lúc chạy lại, tóm tắt cũ vẫn phải dùng được, kèm nhãn "đang cập nhật".

## Yêu cầu
**Chức năng:** danh sách phân trang; lọc theo tiêu đề và khoảng ngày; đọc transcript ảo hóa; sửa
từng đoạn; đổi tiêu đề; xóa có hoàn tác 10 giây; xuất Markdown và PDF.
**Phi chức năng:** danh sách 500 cuộc họp tải dưới 1 giây; transcript 2 giờ cuộn mượt.

## Kiến trúc
Server: endpoint `PATCH /segments/:id` đánh dấu `is_edited`, xác định các chunk bị ảnh hưởng qua
`segment_start_seq`/`segment_end_seq`, và xếp việc chạy lại có phạm vi.

Client: danh sách dùng TanStack Query có phân trang vô hạn. Xuất PDF render từ HTML bằng
`expo-print`, chia sẻ bằng cơ chế sẵn có của hệ điều hành — file không đi qua bất kỳ nơi lưu trữ nào.

## File liên quan
**Tạo:** `apps/api/src/meetings/segments.controller.ts` · `meetings/export.service.ts` ·
`meetings/reindex-scope.ts` · `apps/mobile/app/(app)/meetings/index.tsx` ·
`app/(app)/meetings/[id].tsx` · `src/components/transcript-editor.tsx` · `src/export/`
**Sửa:** `apps/api/src/meetings/meetings.service.ts` (lọc và phân trang)

## Các bước thực hiện
1. `GET /meetings` với phân trang con trỏ, lọc `q` dùng `unaccent(lower(title))`, lọc khoảng ngày.
2. `GET /meetings/:id/segments` phân trang theo `seq`.
3. `PATCH /segments/:id` — sửa `text` hoặc `speaker_label`, đặt `is_edited`.
4. `reindex-scope.ts` — từ tập đoạn bị sửa suy ra tập chunk bị ảnh hưởng.
5. `POST /meetings/:id/reindex` với `scope: changed | full`.
6. `export.service.ts` — dựng Markdown; client render PDF từ đó.
7. Màn hình danh sách: cuộn vô hạn, trạng thái rỗng có hướng dẫn, hiện trạng thái xử lý mỗi dòng.
8. Màn hình chi tiết: transcript ảo hóa, sửa tại chỗ, nhảy nhanh, nhớ vị trí đọc dở.
9. Xóa có hoàn tác 10 giây ngay trên client trước khi lệnh thật sự gửi đi.

## Todo
- [ ] Danh sách phân trang + lọc bỏ dấu
- [ ] Đọc transcript phân trang
- [ ] Sửa đoạn + đánh dấu is_edited
- [ ] Suy ra phạm vi chạy lại
- [ ] Endpoint reindex có phạm vi
- [ ] Xuất Markdown + PDF + chia sẻ
- [ ] Màn hình danh sách và chi tiết
- [ ] Xóa có hoàn tác 10 giây

## Chuẩn hoàn thành
- Danh sách 500 cuộc họp tải dưới 1 giây.
- Tìm "hop sprint" ra "Họp sprint 12".
- Sửa một đoạn rồi chạy lại phạm vi hẹp chỉ xử lý các chunk liên quan — kiểm bằng `processing_jobs`.
- Trong lúc chạy lại, tóm tắt cũ vẫn đọc được kèm nhãn đang cập nhật.
- Transcript 2 giờ cuộn ở 60 khung hình/giây trên máy tầm trung.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Suy phạm vi chạy lại sai → đồ thị lệch | Test dựa trên biên `segment_start_seq`/`segment_end_seq` |
| PDF hỏng dấu tiếng Việt | Nhúng phông hỗ trợ đầy đủ dấu, kiểm trên cả hai nền tảng |
| Hoàn tác xóa bị đua với lệnh xóa | Chỉ gửi lệnh sau khi hết 10 giây, không gửi rồi khôi phục |

## Bảo mật
Bản xuất chỉ đi qua cơ chế chia sẻ của hệ điều hành. Không tải lên bất kỳ dịch vụ nào.
Mọi endpoint lọc theo chủ sở hữu.

## Tiếp theo
Tìm kiếm ngữ nghĩa nối tiếp ở Phase 12.
