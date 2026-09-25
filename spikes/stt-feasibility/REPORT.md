# REPORT · Spike khả thi nhận diện giọng nói trên thiết bị

> **Trạng thái: CHƯA ĐO.** App spike và công cụ phân tích đã sẵn sàng (2026-09-25). Mọi ô kết quả
> bên dưới để trống cho tới khi có số đo thật trên máy thật. Không điền ước lượng — phase-00 cấm
> mọi chỗ ghi "ước chừng".

Kế hoạch: [phase-00](../../plans/260917-1821-meetio-full-implementation/phase-00-spike-stt-feasibility.md) ·
Câu hỏi cần khép: [OQ-01, OQ-05](../../user_stories.md#5-câu-hỏi-còn-mở) · Cách chạy: [README.md](README.md)

---

## 1. Ngưỡng đạt — **đề xuất, phải chốt trước lượt đo đầu tiên**

US-11 để ngưỡng cho spike quyết định. Chốt trước khi đo để kết luận không bị kéo theo con số.

| #   | Tiêu chí                                                                                      | Ngưỡng đề xuất         | Nguồn    |
| --- | --------------------------------------------------------------------------------------------- | ---------------------- | -------- |
| T1  | Chạy liên tục 60 phút, 0 lần dừng không hồi phục — ở cả 3 chế độ                              | bắt buộc               | AC US-11 |
| T2  | Restart xong trong 500ms                                                                      | ≥ 95% số lần           | AC US-11 |
| T3  | Chữ mất do restart                                                                            | ≤ 2% bản chép tay      | OQ-01    |
| T4  | WER tiếng Việt, thu qua loa laptop 50cm                                                       | ≤ 25%                  | OQ-05    |
| T5  | Chạy on-device thật: nhận diện được khi bật chế độ máy bay (app chặn lượt on-device còn mạng) | bắt buộc để giữ NFR-02 | NFR-02   |

**Quy tắc kết luận:** giữ trên thiết bị khi _mọi_ tiêu chí đạt trên ít nhất một máy Android và
một máy iOS, trong đó có máy tầm thấp. Trượt T5 (không có vi-VN on-device) thì chỉ còn đường đám mây
bất kể WER của engine network tốt đến đâu.

## 2. Bố trí đo

| Mục                          | Giá trị                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| File âm thanh                | _(tên, độ dài, số người nói, tỉ lệ xen tiếng Anh ước theo bản chép tay)_ |
| Bản chép tay                 | _(số chữ, người chép, ngày)_                                             |
| Loa laptop                   | _(model, mức âm lượng hệ thống)_                                         |
| Phòng                        | _(độ ồn nền nếu đo được)_                                                |
| Lượt đối chứng nói trực tiếp | _(ai đọc, khoảng cách miệng–máy)_                                        |

## 3. Thiết bị & khả năng nhận diện

Lấy từ khung "khả năng của máy" trên app (cũng nằm trong `run_meta.capabilities` của mỗi log).

| Máy              | OS  | Tầm      | On-device | vi-VN network | vi-VN on-device | Service mặc định |
| ---------------- | --- | -------- | --------- | ------------- | --------------- | ---------------- |
| Android #1       |     | cao      |           |               |                 |                  |
| Android #2 (13+) |     | **thấp** |           |               |                 |                  |
| iOS #1           |     |          |           |               |                 | —                |
| iOS #2           |     |          |           |               |                 | —                |

## 4. Kết quả thô

Dán đầu ra của `npm run analyze -- --reference fixtures/reference.txt --format md runs/*.jsonl`.
Kế hoạch đủ: 3 lần × 4 máy × 3 chế độ = 36 lượt qua loa (engine on-device), cộng lượt đối chứng
nói trực tiếp và lượt engine network trên mỗi máy.

_(chưa có)_

## 5. Năm câu trả lời

| Câu hỏi                                                    | Chỉ số trả lời                                                                  | Kết quả |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------- |
| Chạy liên tục được bao nhiêu phút?                         | `Phút chạy`, `Phiên dài nhất`, `Không hồi phục`                                 |         |
| Rớt bao nhiêu chữ mỗi lần khởi động lại?                   | `Chữ mất/restart (TB)`, `% chữ mất do restart`, `Restart ≤500ms`                |         |
| Chạy nền có sống không?                                    | lượt _Chạy nền_ / _Khoá màn hình_: `Không hồi phục`, `Chữ nhận ra khi chạy nền` |         |
| WER tiếng Việt là bao nhiêu?                               | `WER` lượt loa laptop, engine on-device                                         |         |
| Thu qua loa laptop tệ hơn nói trực tiếp bao nhiêu? (OQ-05) | WER loa laptop − WER nói trực tiếp, cùng máy cùng engine                        |         |

## 6. Khuyến nghị

- [ ] **Giữ trên thiết bị**
- [ ] **Chuyển đám mây**

Lý do (dẫn số đo ở mục 4–5): _(chưa có)_

## 7. Nếu chuyển đám mây — so sánh nhà cung cấp

Ba tiêu chí theo phase-00 bước 8; **không** xét tách người nói. Đo chất lượng bằng chính file âm
thanh ghi lại qua loa laptop (bật `recordingOptions.persist` hoặc ghi riêng), không dùng file gốc sạch.

| Nhà cung cấp                   | Chi phí / giờ âm thanh | Độ trễ (partial đầu tiên) | WER tiếng Việt qua loa |
| ------------------------------ | ---------------------- | ------------------------- | ---------------------- |
| Google Cloud STT               |                        |                           |                        |
| Deepgram                       |                        |                           |                        |
| Whisper (OpenAI API / tự host) |                        |                           |                        |

## 8. Ghi vào đặc tả

Sau khi chốt: cập nhật [OQ-01 và OQ-05](../../user_stories.md#5-câu-hỏi-còn-mở) bằng số đo ở đây rồi
đóng lại; nếu chuyển đám mây thì sửa NFR-02, mục 0 và mục 6 của
[kiến trúc](../../docs/system-architecture.md), và viết lại Phase 07 trước khi khởi công.
