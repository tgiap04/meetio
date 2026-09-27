# Phase 08 · Hàng đợi ngoại tuyến & phục hồi

**Liên kết:** [plan.md](plan.md) · [US-14](../../user_stories.md#us-14--không-mất-dữ-liệu-khi-mạng-chập-chờn) ·
[US-15](../../user_stories.md#us-15--phục-hồi-cuộc-họp-sau-khi-app-đóng-đột-ngột)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** 🟡 **implemented — pending Phase 00 real-device verification** · **Phụ thuộc:** Phase 07

Giữ cho không một chữ nào mất đi, dù mạng rớt hay app chết.

## Nhận định then chốt
- Đây là phase quyết định người dùng có tin được sản phẩm hay không. Mất một cuộc họp là mất một
  người dùng, không có lần thứ hai.
- Hàng đợi phải bền vững trên đĩa, không phải trong RAM. App bị kill thì RAM bay sạch.
- Chỉ xóa khỏi hàng đợi sau khi nhận `segment_ack`. Đây là nửa còn lại của hợp đồng mà Phase 05 giữ
  nửa kia — hai nửa sai lệch thì cơ chế vô hiệu.

## Yêu cầu
**Chức năng:** hàng đợi ghi xuống đĩa; gửi lại khi có mạng; hiển thị trạng thái đồng bộ; phát hiện
cuộc họp dang dở lúc mở app; tiếp tục hoặc kết thúc cuộc họp đó.
**Phi chức năng:** 10 phút mất mạng thì đồng bộ bù xong trong 30 giây; hàng đợi chịu được 3.600 đoạn
(một cuộc họp 60 phút).

## Kiến trúc
SQLite trên thiết bị (`expo-sqlite`) làm hàng đợi bền vững — không dùng AsyncStorage, vì ghi nhiều
lần liên tục trên AsyncStorage vừa chậm vừa không có giao dịch.

Bảng `pending_segments(meeting_id, seq, payload, created_at, attempts)`. Một worker nền đọc hàng đợi
theo lô, gửi qua WebSocket nếu còn kết nối, ngược lại đợi. Mạng trở lại thì chuyển sang
`POST /segments/bulk` để đuổi cho nhanh.

## File liên quan
**Tạo:** `apps/mobile/src/queue/segment-queue.ts` · `queue/sync-worker.ts` ·
`queue/queue.schema.ts` · `src/components/sync-indicator.tsx` ·
`apps/mobile/app/(app)/index.tsx` (banner cuộc họp dang dở)
**Sửa:** `apps/mobile/src/recording/recording-machine.ts` (đẩy đoạn vào hàng đợi thay vì gửi thẳng)

## Các bước thực hiện
1. Schema SQLite cho hàng đợi + lớp truy cập có giao dịch.
2. Mọi đoạn đã chốt ghi vào hàng đợi **trước**, gửi đi sau.
3. `sync-worker`: gửi theo lô, nhận `segment_ack` thì xóa dòng tương ứng.
4. Theo dõi trạng thái mạng bằng `expo-network`; mất kết nối thì dừng gửi, có lại thì đuổi bù.
5. Chỉ báo đồng bộ trên màn hình ghi: đã đồng bộ / đang chờ N đoạn / mất kết nối.
6. Lúc mở app: hỏi server có cuộc họp `recording` nào không → hiện banner "Có cuộc họp chưa kết thúc".
7. Tiếp tục: nạp đoạn từ server + hàng đợi local, hợp nhất theo `seq`, khử trùng, bật mic lại.
8. Kết thúc: đuổi nốt hàng đợi rồi gọi `end`.
9. Test hỗn loạn: kill app ngẫu nhiên giữa cuộc họp 30 lần, kiểm tra không mất đoạn nào.

## Todo
- [x] Hàng đợi SQLite có giao dịch
- [x] Ghi vào hàng đợi trước khi gửi
- [x] sync-worker gửi lô + xóa theo ack
- [x] Theo dõi mạng + đuổi bù khi có lại
- [x] Chỉ báo trạng thái đồng bộ
- [x] Phát hiện + banner cuộc họp dang dở
- [x] Luồng tiếp tục có hợp nhất và khử trùng
- [~] Test hỗn loạn 30 lần kill app — code + simulated test done (jest, gả lập kill); real device pending (Phase 17)

## Chuẩn hoàn thành
- Bật chế độ máy bay 10 phút giữa cuộc họp: bật lại mạng thì mọi đoạn lên server trong 30 giây, đúng thứ tự — **code ✓**
- Kill app giữa cuộc họp: mở lại thấy banner, chọn tiếp tục thì transcript đầy đủ — **code ✓**
- Test hỗn loạn 30 lần: không mất đoạn nào, không trùng đoạn nào — **simulated ✓ (jest), real device pending Phase 17**
- Hàng đợi 3.600 đoạn không làm app giật hay ngốn bộ nhớ bất thường — **chưa đo** (code gửi theo lô 1000 + danh sách ảo hóa; đo trên máy tầm thấp ở Phase 17)

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| SQLite bị khóa khi ghi và đọc đồng thời | Bật WAL, dùng một kết nối duy nhất qua lớp truy cập |
| Hợp nhất local và server bị trùng đoạn | Khử trùng theo `seq`, bên server luôn thắng |
| Hàng đợi phình vì ack không bao giờ về | Giới hạn số lần thử, quá ngưỡng thì báo người dùng thay vì thử mãi |

## Bảo mật
Hàng đợi SQLite chứa nội dung cuộc họp — đặt trong vùng lưu trữ riêng của app, loại khỏi sao lưu
iCloud/Google Drive để nội dung nhạy cảm không rò ra bản sao lưu đám mây.

## Tiếp theo
Mở khóa Phase 09 (dịch song song). Phase 17 (kiểm thử & nghiệm thu) — real-device kill, 60min run, lock-screen/airplane-mode recovery — chờ Phase 00 test thực tế xong để chốt ngưỡng mất chữ.

## Thiết kế thi công (2026-09-27)
Làm cùng Phase 07 (quyết định người dùng).

**API (nhỏ, tương thích ngược):** `POST /meetings` nhận thêm `id` (UUID do client sinh) và `started_at` tuỳ chọn — tạo lặp
cùng `id` của cùng người trả lại bản đã có (idempotent), `started_at` kẹp trong [now − 24h, now]. `pause`/`resume`/`end`
nhận `at` tuỳ chọn (thời điểm thao tác khi phát lại sau mất mạng), kẹp trong [mốc chuyển trạng thái gần nhất, now] —
thời gian tạm dừng vẫn đúng dù phát lại muộn.

**SQLite (`expo-sqlite`, WAL, một kết nối):** `local_meetings(id, status, create_body, started_at, server_created,
last_seq)` · `pending_ops(id, meeting_id, op, at)` thao tác vòng đời chờ phát lại theo thứ tự · `pending_segments(meeting_id,
seq, payload, attempts)`. Ghi đoạn vào bảng trong giao dịch (tăng `last_seq` + insert) **trước** khi gửi.

**Sync worker:** phát lại `pending_ops` theo thứ tự (create trước); socket.io `/meeting-room` với access token (TOKEN_EXPIRED →
refresh rồi nối lại); gửi đoạn theo thứ tự, xoá khi `segment_ack`; tồn > 50 đoạn hoặc `RATE_LIMITED` → đuổi bù bằng
`/segments/bulk` (1000/lần). Trạng thái: đã đồng bộ / đang chờ N / mất kết nối. Không thêm `expo-network` — trạng thái socket
và lỗi HTTP đủ biết mất mạng. Kết thúc: xả hết hàng đợi → `end {last_seq}`; 409 `SEGMENTS_PENDING` → gửi lại seq thiếu.

**Phục hồi (US-15):** mở app → cuộc họp local chưa `ended` + `GET /meetings?status=recording|paused` → banner "Có cuộc họp
chưa kết thúc" (giờ bắt đầu) ở Home: Tiếp tục (nạp đoạn server + local, khử trùng theo seq, bật mic, seq nối tiếp) / Kết thúc.
Server đã tự đóng sau 24h (409 khi resume) → báo và chỉ còn Kết thúc/xem.

**Bảo mật:** Android `allowBackup: false`; iOS: file SQLite nằm trong vùng iCloud sao lưu và không loại ra được — chỉ các đoạn chưa được server xác nhận nằm trong đó (xóa ngay khi có ack); NFR-02 (audio) không liên quan vì audio không bao giờ được lưu.

**Test hỗn loạn (2026-09-27):** meetings-offline-replay.e2e (API) + jest integration test gả lập kill (dựng lại worker từ cùng DB ở điểm ngẫu nhiên × 30, all seq track) — ✓ không mất/không trùng. Kill thật + 60min run + lock-screen 10min + airplane-mode 10min trên máy thuộc Phase 17 (khi Phase 00 test thực tế xong).

**Reviewer findings (2026-09-27):**
- **Critical (fixed):** shared-phone account switch mid-sync có thể upload meeting của user A dưới token user B → fixed: axios request-interceptor guard `expectedOwnerId` + worker dừng ngay nếu owner change, with regression tests
- **Medium (fixed):** failed disk write trước đây drop đoạn → giờ giữ trong memory, retry theo thứ tự
- Dead components removed
