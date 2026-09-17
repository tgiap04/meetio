# Phase 01 · Nền tảng monorepo & CI

**Liên kết:** [plan.md](plan.md) · [Kiến trúc §0](../../docs/system-architecture.md#0-thành-phần)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Chặn:** mọi phase còn lại

Dựng bộ khung repo, công cụ và đường ống CI để mọi phase sau chỉ việc viết tính năng.

## Nhận định then chốt
- Kiểu dữ liệu dùng chung giữa mobile và API (DTO, payload sự kiện WebSocket) phải nằm ở một chỗ
  duy nhất. Chép tay hai bên là nguồn lỗi chắc chắn xảy ra.
- Cả hai đầu đều TypeScript → chia sẻ kiểu là thứ rẻ nhất và lời nhất trong kiến trúc này.
- Quy tắc dự án: mỗi file code dưới 200 dòng. Bố cục thư mục phải khuyến khích điều đó ngay từ đầu.

## Yêu cầu
**Chức năng:** workspace chạy được cả `apps/api` lẫn `apps/mobile`; lệnh dựng, lint, kiểm kiểu và
test chạy được từ thư mục gốc; CI chạy trên mỗi pull request.
**Phi chức năng:** CI dưới 5 phút; cấu hình môi trường tách bạch dev/staging/prod.

## Kiến trúc
```
apps/api/            NestJS — module theo miền nghiệp vụ
apps/mobile/         Expo Router
packages/shared/     kiểu dùng chung: DTO, payload WS, enum trạng thái, mã lỗi
docker-compose.yml   Postgres 15 + pgvector, Redis 7
```
Dùng pnpm workspace. `packages/shared` là nguồn duy nhất cho `MeetingStatus`, `ProcessingStep`,
`ApiErrorCode` và mọi payload WebSocket ở [api-spec §8](../../docs/api-spec.md#8-websocket).

## File liên quan
**Tạo:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.eslintrc.cjs`,
`docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.gitignore`,
`apps/api/` (khung NestJS), `apps/mobile/` (khung Expo), `packages/shared/src/`

## Các bước thực hiện
1. Khởi tạo pnpm workspace + `tsconfig.base.json` với đường dẫn alias cho `@graphmeet/shared`.
2. Dựng `apps/api` bằng Nest CLI; bật `ValidationPipe` toàn cục và bộ lọc lỗi theo khuôn ở
   [api-spec §0](../../docs/api-spec.md#0-qui-ước-chung).
3. Dựng `apps/mobile` bằng Expo Router, bật TypeScript strict.
4. Viết `packages/shared`: enum trạng thái, mã lỗi, DTO, payload WebSocket — lấy nguyên từ đặc tả API.
5. Viết `docker-compose.yml`: image `pgvector/pgvector:pg15` và Redis 7.
6. Cấu hình lint + format + husky pre-commit chạy lint trên file đã stage.
7. Viết CI: cài phụ thuộc → kiểm kiểu → lint → test → build, chạy trên mỗi PR.
8. Viết `.env.example` liệt kê đủ biến môi trường, không có giá trị thật.

## Todo
- [ ] pnpm workspace + tsconfig gốc
- [ ] Khung apps/api (NestJS)
- [ ] Khung apps/mobile (Expo Router)
- [ ] packages/shared với kiểu lấy từ đặc tả API
- [ ] docker-compose Postgres+pgvector và Redis
- [ ] ESLint + Prettier + husky
- [ ] Workflow CI
- [ ] .env.example + tài liệu thiết lập trong README

## Chuẩn hoàn thành
- `pnpm install && pnpm build` chạy sạch từ thư mục gốc.
- `docker compose up` cho ra Postgres có sẵn extension `vector` và `unaccent`.
- CI xanh trên một PR trống.
- Sửa kiểu trong `packages/shared` làm cả hai app báo lỗi biên dịch — chứng minh kiểu thực sự dùng chung.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Metro bundler của Expo không hiểu package workspace | Cấu hình `metro.config.js` bật `watchFolders` từ đầu, đừng để gặp lỗi mới sửa |
| Trôi phiên bản giữa hai app | Ghim phiên bản TypeScript và React ở gốc workspace |

## Bảo mật
`.gitignore` phải chặn mọi biến thể `.env`. Không commit khóa API dưới bất kỳ hình thức nào —
khóa Gemini chỉ tồn tại ở backend.

## Tiếp theo
Mở khóa Phase 02 (schema) và Phase 06 (nền tảng mobile).
