# Phase 17 · Kiểm thử & nghiệm thu

**Liên kết:** [plan.md](plan.md) · [user_stories.md](../../user_stories.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Phụ thuộc:** mọi phase

Chứng minh 41 story đạt acceptance criteria và 13 NFR đạt ngưỡng — bằng phép đo, không bằng lời khẳng định.

## Nhận định then chốt
- Mỗi AC trong [user_stories.md](../../user_stories.md) là một ca kiểm thử. Tài liệu đã viết sẵn bộ
  test, phase này chỉ việc hiện thực hóa.
- Không có chỗ nào được "coi như đạt". AC nào không đo được thì AC đó viết sai và phải sửa lại.
- Kiểm thử hỗn loạn cho luồng ghi âm là bắt buộc, không phải tùy chọn — đó là nơi người dùng mất dữ
  liệu nếu có lỗi.
- Bốn câu hỏi mở phải khép lại bằng số đo thật trước khi coi là xong.

## Yêu cầu
**Chức năng:** unit test cho logic nghiệp vụ; integration test cho mọi endpoint; e2e cho các luồng
chính; test bảo mật cho IDOR; test hỗn loạn cho ghi âm; bộ dữ liệu vàng cho AI.
**Phi chức năng:** độ phủ trên 80% cho tầng nghiệp vụ; toàn bộ suite chạy trong CI dưới 15 phút.

## Kiến trúc
Bốn tầng: unit (Jest) · integration (Jest + Postgres trong Testcontainers) · e2e mobile (Maestro) ·
đo chất lượng AI (bộ dữ liệu vàng, chạy tay theo đợt vì tốn tiền gọi API).

Ma trận truy vết: mỗi US ánh xạ tới ít nhất một ca kiểm thử, tự sinh báo cáo để thấy ngay story nào
chưa được phủ.

## File liên quan
**Tạo:** `apps/api/test/` (integration theo từng module) · `apps/mobile/.maestro/` ·
`test/security/idor.spec.ts` · `test/chaos/recording-chaos.spec.ts` ·
`test/golden/` (bộ dữ liệu vàng cho khớp thực thể và hỏi đáp) ·
`docs/traceability-matrix.md`
**Sửa:** `.github/workflows/ci.yml` (thêm các tầng test)

## Các bước thực hiện
1. Unit test cho máy trạng thái, bộ cắt chunk, chuẩn hóa tên, bộ khớp thực thể, bộ gom lô.
2. Integration test cho toàn bộ endpoint ở [api-spec](../../docs/api-spec.md), gồm cả nhánh lỗi.
3. Bộ test IDOR quét mọi endpoint nhận id tài nguyên.
4. Test hỗn loạn ghi âm: mất mạng, kill app, engine STT ngắt, chuyển ứng dụng.
5. E2E Maestro cho ba luồng chính: ghi cuộc họp · đọc lại và sửa · hỏi đáp có trích dẫn.
6. Đo chất lượng AI trên bộ dữ liệu vàng: độ chính xác khớp thực thể, độ đúng trích dẫn, tỉ lệ bịa.
7. Bộ đo hiệu năng cho mọi ngưỡng NFR-05 và NFR-06.
8. Dựng `docs/traceability-matrix.md` ánh xạ 41 US → ca kiểm thử, có cột kết quả.
9. Khép bốn câu hỏi mở OQ-01→04 bằng số đo thật ghi vào tài liệu.

## Todo
- [ ] Unit test tầng nghiệp vụ (phủ trên 80%)
- [ ] Integration test toàn bộ endpoint
- [ ] Bộ test IDOR
- [ ] Test hỗn loạn luồng ghi âm
- [ ] E2E ba luồng chính
- [ ] Đo chất lượng AI trên bộ dữ liệu vàng
- [ ] Bộ đo hiệu năng NFR
- [ ] Ma trận truy vết 41 US
- [ ] Khép OQ-01→04 bằng số đo

## Chuẩn hoàn thành
- Ma trận truy vết không còn dòng nào trống.
- 13 NFR đều có phép đo và số đo thực tế đạt ngưỡng.
- Không test nào bị bỏ qua hay đánh dấu skip để build xanh.
- Bốn câu hỏi mở đều có câu trả lời dựa trên số đo, không còn phỏng đoán nào.
- Toàn bộ suite chạy trong CI dưới 15 phút.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Test AI tốn tiền gọi API | Bộ dữ liệu vàng chạy tay theo đợt, không chạy mỗi lần push |
| Test e2e mobile hay chập chờn | Dùng chờ theo điều kiện, không chờ theo thời gian cố định |
| Áp lực deadline đẩy tới việc skip test | Chuẩn hoàn thành ghi rõ: không skip; CI không cho bỏ qua |

## Bảo mật
Bộ test IDOR và test rò dữ liệu chéo người dùng là cổng chặn phát hành, không phải hạng mục tùy chọn.

## Tiếp theo
Hoàn tất kế hoạch. Chuyển sang vận hành và theo dõi.
