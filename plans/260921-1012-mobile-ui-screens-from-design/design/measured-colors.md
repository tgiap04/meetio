# Màu đo trực tiếp từ design.png

Lấy bằng `magick design.png -crop <vùng> -colors 4 histogram:` — là màu chiếm nhiều pixel
nhất trong vùng, không phải ước lượng bằng mắt. Dùng những giá trị này thay vì đoán.

## Node thực thể — màn 10 Knowledge Graph

Màu KHÔNG cố định theo loại: hai node `Person` mang hai màu khác nhau, hai node `Task`
cũng vậy. Đây là bảng màu xoay vòng theo node, nhãn loại tô theo accent của chính node đó.

| Node trong design | Nền pill | Ghi chú |
|---|---|---|
| Nguyễn Văn Anh (Person) | `#C7D5F4` | xanh dương nhạt |
| API (Task) | `#D6F7E5` | mint |
| Lê Thị Mai (Person) | `#E2DCFE` | tím lavender |
| Authentication (Task) | `#FCECCB` | hổ phách nhạt |
| Dự án ABC (Project) | `#FE7E34` | hình tròn đặc, chữ trắng |

## Badge trạng thái

| Badge | Nền | Chữ |
|---|---|---|
| Đã xử lý | `colors.successTint` `#DEF7EB` đã có sẵn | xanh lá đậm |
| Đang xử lý | `#FDEFDD` | `#FC7437` |

## Màn 7 — panel "Đang xử lý bằng AI"

Nền `#FAF1E5` (rất sát `colors.primaryTint` `#FEF3E6` đã có — cân nhắc dùng lại token cũ
thay vì thêm token mới gần trùng).

## Cảnh báo tương phản

`colors.test.ts` bắt buộc chữ phải đạt AA trên nền cream `surface`. Chữ cam trên các nền
nhạt ở trên phải dùng `colors.primaryStrong`, không dùng `colors.primary`.
