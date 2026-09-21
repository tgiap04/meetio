# Clarifications

## Session 2026-09-21

- Q: Màn 12 — caption "Thư viện" nhưng header vẽ "Hỏi đáp AI", màn 11 thiếu khỏi sheet. Dựng theo hướng nào? → A: Dựng thành tab Thư viện — header "Thư viện", section đầu "Gần đây", giữ "Tuần trước", có bottom tab bar; coi "Hỏi đáp AI" là lỗi copy-paste của designer
- Q: Trang chủ và Cài đặt đã có logic thật (API /me, đăng xuất, xóa tài khoản, retention) kèm test — xử lý ra sao khi design vẽ lại? → A: Giữ logic, khoác design mới; chỉ phần hoàn toàn mới (cuộc họp, transcript, graph, search) dùng mock
- Q: Cổng auth chặn nhóm (app) khi chưa đăng nhập, mà đăng nhập cần API thật — làm sao xem hết màn mới? → A: Giữ nguyên cổng auth, không thêm chế độ preview
- Q: Mức test cho 11 màn UI mock mới? → A: Test đầy đủ như chuẩn hiện tại (mỗi component/màn một file test)

### Quyết định của orchestrator (không hỏi lại)

- Q: Chuỗi điều hướng ghi âm? → A: Trang chủ → 5 Cài đặt ghi âm → 6 Ghi âm trực tiếp → 7 Sau khi kết thúc → 8 Tổng quan cuộc họp
- Q: Màn 9 Transcript và 10 Knowledge Graph là tab trong màn 8 hay màn riêng? → A: Màn riêng (design vẽ header + back chevron riêng), mở từ tab tương ứng của màn 8
- Q: Nguồn dữ liệu mock? → A: Fixtures gõ kiểu trong `src/mocks/`, nội dung lấy đúng từ design.png, không bịa thêm
