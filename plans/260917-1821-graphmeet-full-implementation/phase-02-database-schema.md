# Phase 02 · Schema cơ sở dữ liệu

**Liên kết:** [plan.md](plan.md) · [Mô hình dữ liệu](../../docs/data-model.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** Phase 01

Hiện thực hóa toàn bộ 13 bảng, enum, ràng buộc và index. Không có logic nghiệp vụ ở phase này.

## Nhận định then chốt
- `UNIQUE (meeting_id, seq)` trên `transcript_segments` chính là thứ làm cho việc gửi lại an toàn.
  Thiếu nó thì cơ chế chống mất dữ liệu ở [US-14](../../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn) vô nghĩa.
- Index HNSW cho vector phải có ngay từ migration đầu. Thêm sau trên bảng lớn là một lần khóa bảng dài.
- `user_id` được nhân bản có chủ đích ở `meeting_chunks`: truy vấn tương đồng phải lọc quyền ngay
  trong câu lệnh, ép join ngược sẽ phá hiệu quả index.
- Đồ thị thuộc phạm vi **người dùng**, không phải cuộc họp. Đây là khác biệt nền tảng so với bản
  đặc tả gốc và nó định hình toàn bộ Phase 13 và 15.

## Yêu cầu
**Chức năng:** migration tạo đủ bảng, enum, khóa ngoại, index; có seed dữ liệu mẫu cho phát triển.
**Phi chức năng:** migration chạy tiến và lùi được; đặt tên thống nhất; mọi khóa ngoại có index.

## Kiến trúc
Prisma làm ORM, nhưng các thao tác vector viết SQL thô — Prisma chưa hỗ trợ tốt kiểu `vector`.
Migration quản lý bằng `prisma migrate`, riêng phần `CREATE EXTENSION` và index HNSW đặt trong
migration SQL viết tay.

Nhóm bảng: tài khoản (`users`, `refresh_tokens`) · cuộc họp (`meetings`, `transcript_segments`) ·
truy hồi (`meeting_chunks`) · đồ thị (`entities`, `entity_mentions`, `relations`,
`entity_merge_rejections`) · kết quả (`action_items`, `qa_messages`) · vận hành (`processing_jobs`,
`usage_records`).

## File liên quan
**Tạo:** `apps/api/prisma/schema.prisma` · `apps/api/prisma/migrations/` ·
`apps/api/prisma/seed.ts` · `apps/api/src/database/database.module.ts` ·
`apps/api/src/database/vector.repository.ts` (truy vấn vector viết tay)

## Các bước thực hiện
1. Migration đầu: `CREATE EXTENSION vector; CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;`
2. Khai báo enum: `meeting_status`, `entity_type`, `action_status`, `job_step`, `job_status`.
3. Viết `schema.prisma` đúng theo [mô hình dữ liệu](../../docs/data-model.md), cột `vector(768)` khai
   bằng `Unsupported("vector(768)")`.
4. Migration SQL viết tay cho toàn bộ index: HNSW cho hai bảng có embedding, GIN cho `aliases` và
   tiêu đề, B-tree cho các khóa ngoại và cột sắp xếp.
5. Đặt quy tắc xóa cascade đúng bảng đối chiếu ở [mục 7](../../docs/data-model.md#7-quy-tắc-xóa).
6. Viết seed: 1 người dùng, 3 cuộc họp với transcript thật, thực thể và quan hệ mẫu.
7. Viết test migration: chạy tiến → chạy lùi → chạy tiến lại, dữ liệu vẫn nguyên vẹn.

## Todo
- [ ] Migration extension
- [ ] Enum
- [ ] 13 bảng trong schema.prisma
- [ ] Migration index viết tay (HNSW, GIN, B-tree)
- [ ] Quy tắc cascade
- [ ] Script seed
- [ ] Test migration tiến/lùi
- [ ] Đo thời gian truy vấn vector trên 10.000 chunk giả lập

## Chuẩn hoàn thành
- `prisma migrate deploy` chạy sạch trên cơ sở dữ liệu trống.
- Tìm tương đồng vector trên 10.000 chunk trả về dưới 100ms.
- Xóa một cuộc họp dọn sạch mọi bảng con, thực thể chia sẻ với cuộc họp khác vẫn còn nguyên.
- Chèn hai segment trùng `(meeting_id, seq)` bị ràng buộc chặn lại.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Prisma không hiểu kiểu `vector` | Cô lập mọi truy vấn vector trong `vector.repository.ts`, không rải khắp code |
| Tham số HNSW đặt sai → tìm kiếm chậm | Đo với `m=16, ef_construction=64` trước, chỉnh theo số liệu chứ không theo cảm tính |
| Xóa cascade bỏ sót thực thể mồ côi | Test riêng cho quy tắc xóa ở [mục 7](../../docs/data-model.md#7-quy-tắc-xóa) |

## Bảo mật
Mọi bảng chứa dữ liệu người dùng đều phải có `user_id`. Không bảng nào được truy vấn mà thiếu điều
kiện `user_id` — đây là ràng buộc sẽ được kiểm tra lại ở Phase 03.

## Tiếp theo
Mở khóa Phase 03 (xác thực) và Phase 11 (hạ tầng tác vụ).
