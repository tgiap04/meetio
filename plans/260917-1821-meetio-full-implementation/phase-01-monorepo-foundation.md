# Phase 01 · Nền tảng monorepo & CI

**Liên kết:** [plan.md](plan.md) · [Kiến trúc §0](../../docs/system-architecture.md#0-thành-phần) ·
[Biên bản chốt stack](../reports/brainstorm-2026-09-17-codebase-stack-and-scaffold.md)

## Tổng quan
**Ưu tiên:** Cao · **Trạng thái:** ⬜ pending · **Chặn:** mọi phase còn lại

Dựng bộ khung repo, công cụ và đường ống CI để mọi phase sau chỉ việc viết tính năng.

## Nhận định then chốt
- Kiểu dữ liệu dùng chung giữa mobile và API (DTO, payload sự kiện WebSocket) phải nằm ở một chỗ
  duy nhất. Chép tay hai bên là nguồn lỗi chắc chắn xảy ra.
- Cả hai đầu đều TypeScript → chia sẻ kiểu là thứ rẻ nhất và lời nhất trong kiến trúc này.
- **`@nestjs/swagger` CLI plugin không vượt được ranh giới package.** Nó chỉ quét file trong đúng
  tsconfig của chính nó, nên không thấy DTO class import từ `packages/shared`. Đây là giới hạn đã
  kiểm chứng, không phải phỏng đoán — xem [kiểm chứng stack](../reports/researcher-2026-09-17-stack-verification.md).
- Đặt decorator `@ApiProperty()` vào `packages/shared` cũng không được: nó kéo `@nestjs/swagger`
  thành dependency truyền vào bundle React Native.
- Quy tắc dự án: mỗi file code dưới 200 dòng. Bố cục thư mục phải khuyến khích điều đó ngay từ đầu.

## Yêu cầu
**Chức năng:** workspace chạy được cả `apps/api` lẫn `apps/mobile`; lệnh dựng, lint, kiểm kiểu và
test chạy được từ thư mục gốc; Swagger UI phục vụ tại `/api/docs`; CI chạy trên mỗi pull request.
**Phi chức năng:** CI dưới 5 phút; cấu hình môi trường tách bạch dev/staging/prod.

## Kiến trúc

```
apps/api/            NestJS — module theo miền nghiệp vụ, + TypeORM + @nestjs/swagger
apps/mobile/         Expo Router — + axios + TanStack Query + Zustand
packages/shared/     CHỈ kiểu: interface DTO, payload WS, enum trạng thái, mã lỗi
docker-compose.yml   Postgres 15 + pgvector, Redis 7
```

Dùng **yarn 4 workspaces** với `nodeLinker: node-modules` trong `.yarnrc.yml` — Metro của React
Native không hiểu PnP, nên PnP không phải lựa chọn. `nodeLinker: node-modules` đưa yarn 4 về đúng
bố cục của yarn 1 nhưng giữ được resolver còn bảo trì.

### Tách hợp đồng khỏi hiện thực (bắt buộc)

```
packages/shared/     CHỈ kiểu + hằng số enum. Không decorator, không runtime dep.
                     interface → biến mất lúc biên dịch.
                     const-object enum → LÀ giá trị runtime, cần build ra dist/.

apps/api/**/dto/     class `implements` interface của shared,
                     mang @ApiProperty() + class-validator.
                     Nằm trong tsconfig của apps/api → plugin hoạt động.

apps/mobile/         import interface của shared trực tiếp.
                     Không có gì từ @nestjs/swagger chạm vào bundle.
```

```ts
// packages/shared — hợp đồng
export interface CreateMeetingRequest {
  title?: string; source_language: string; translate_to?: string;
}

// apps/api — hiện thực; `implements` là mối nối compiler ép giữ đồng bộ
export class CreateMeetingDto implements CreateMeetingRequest {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiProperty({ example: 'vi-VN' }) @IsString() source_language: string;
  @ApiPropertyOptional() @IsOptional() @IsString() translate_to?: string;
}
```

Đổi tên field ở `shared` → `apps/api` báo lỗi biên dịch ngay. **TypeORM entity là tầng lưu trữ
riêng, không bao giờ lộ ra bề mặt API.**

### `shared` cần build — đính chính

Bản đầu của tài liệu này viết "interface + const enum → biến mất lúc biên dịch". **Chỉ đúng một
nửa.** Interface thì biến mất thật, nhưng enum viết dạng const-object
(`export const MeetingStatus = {...} as const`) **là giá trị runtime thật** — cả hai app đều cần
đọc giá trị đó lúc chạy. Vì vậy:

- `packages/shared` có bước build; `main`/`types` trỏ vào `dist/`, không phải `src/`.
  Node không chạy được `.ts` làm `main`, nên `node apps/api/dist/main.js` cần `dist/index.js`.
- Dùng **TypeScript project references** (`shared` đặt `composite: true`; `apps/api` khai
  `references`). Thiếu nó, `nest build` nhân bản nguyên source của `shared` vào `apps/api/dist`
  và phá bố cục output.
- Lệnh gốc `build` / `typecheck` / `test` chạy `--topological` để `shared` luôn build trước.

**Bất biến không đổi:** `dependencies` của `packages/shared` vẫn phải **rỗng**. "Có bước build"
khác với "có runtime dependency" — cái thứ hai mới là thứ kéo code server vào bundle RN.

`packages/shared` là nguồn duy nhất cho `MeetingStatus`, `ProcessingStep`, `ApiErrorCode` và mọi
payload WebSocket ở [api-spec §8](../../docs/api-spec.md#8-websocket).

**JSON giữ nguyên `snake_case`** đúng như [api-spec](../../docs/api-spec.md) (`access_token`,
`started_at_ms`, `meeting_id`). DTO và cột TypeORM đều snake_case. Không ai được "dọn dẹp" thành
camelCase — đặc tả là hợp đồng với client, không phải gợi ý.

## File liên quan
**Tạo:** `package.json`, `.yarnrc.yml`, `yarn.lock`, `tsconfig.base.json`, `.eslintrc.cjs`,
`docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `.gitignore`,
`apps/api/` (khung NestJS + `main.ts` có `SwaggerModule`), `apps/mobile/` (khung Expo +
`metro.config.js`), `packages/shared/src/` (`package.json` có `dependencies` rỗng)

## Các bước thực hiện
1. Khởi tạo yarn 4 workspace: `.yarnrc.yml` với `nodeLinker: node-modules`; `tsconfig.base.json`
   với đường dẫn alias cho `@meetio/shared`.
2. **Xác minh ngay:** `yarn install && yarn workspace mobile expo start` phải chạy. Metro giở quẻ →
   hạ về yarn 1 + `nohoist` cho `react-native` và ghi lại lý do (xem bảng rủi ro).
3. Dựng `apps/api` bằng Nest CLI; bật `ValidationPipe` toàn cục (`whitelist: true`) và bộ lọc lỗi
   theo khuôn ở [api-spec §0](../../docs/api-spec.md#0-qui-ước-chung).
4. Cấu hình `SwaggerModule` tại `/api/docs`: bật CLI plugin trong `nest-cli.json`, khai Bearer auth,
   sinh `openapi.json` ra file để CI kiểm.
5. Dựng `apps/mobile` bằng Expo Router, bật TypeScript strict; `metro.config.js` bật `watchFolders`
   trỏ vào gốc workspace ngay từ đầu, đừng để gặp lỗi mới sửa.
6. Viết `packages/shared`: enum trạng thái, mã lỗi, interface DTO, payload WebSocket — lấy nguyên
   từ đặc tả API. `package.json` của nó phải có `dependencies` rỗng.
7. Viết `docker-compose.yml`: image `pgvector/pgvector:pg15` và Redis 7.
8. Cấu hình lint + format + husky pre-commit chạy lint trên file đã stage.
9. Viết CI: cài phụ thuộc → kiểm kiểu → lint → test → build, chạy trên mỗi PR. Thêm một job kiểm
   `packages/shared/package.json` có `dependencies` rỗng.
10. Viết `.env.example` liệt kê đủ biến môi trường, không có giá trị thật.

## Todo
- [ ] yarn 4 workspace + `.yarnrc.yml` (`nodeLinker: node-modules`) + tsconfig gốc
- [ ] **Xác minh `yarn install` + `expo start` chạy được** (cổng chặn, làm trước mọi thứ khác)
- [ ] Khung apps/api (NestJS) + ValidationPipe + bộ lọc lỗi
- [ ] Swagger UI tại `/api/docs` + CLI plugin + Bearer auth
- [ ] Khung apps/mobile (Expo Router) + `metro.config.js` watchFolders
- [ ] packages/shared với kiểu lấy từ đặc tả API, `dependencies` rỗng
- [ ] packages/shared có bước build + project references, script gốc chạy `--topological`
- [ ] docker-compose Postgres+pgvector và Redis
- [ ] ESLint + Prettier + husky
- [ ] Workflow CI + job kiểm `shared` không có runtime dep
- [ ] .env.example + tài liệu thiết lập trong README

## Chuẩn hoàn thành
- **`yarn install` và `expo start` chạy được** — đây là chuẩn phải đạt đầu tiên, trước mọi thứ khác.
- `yarn install && yarn build` chạy sạch từ thư mục gốc.
- `docker compose up` cho ra Postgres có sẵn extension `vector`, `unaccent` và `pg_trgm`.
- Swagger UI mở được tại `/api/docs`, schema sinh **từ DTO** chứ không viết tay.
- `packages/shared/package.json` có `dependencies` rỗng.
- CI xanh trên một PR trống.
- Sửa kiểu trong `packages/shared` làm cả hai app báo lỗi biên dịch — chứng minh kiểu thực sự dùng chung.

## Rủi ro
| Rủi ro | Đối sách |
|--------|----------|
| Metro bundler không hiểu package workspace | `metro.config.js` bật `watchFolders` từ đầu, đừng để gặp lỗi mới sửa |
| yarn 4 xung đột với Expo/Metro | `nodeLinker: node-modules` bắt buộc. Vẫn vỡ → xóa lockfile, hạ về yarn 1 + `nohoist`. **Chi phí đổi ý = một file lockfile**, nên đây là rủi ro rẻ. Là chuẩn hoàn thành số 1 để phát hiện sớm |
| Rò rỉ runtime dep vào `packages/shared` | Job CI kiểm `dependencies` rỗng. Một `yarn add` sai chỗ là bundle RN kéo theo code server |
| Quên project references → `nest build` nhân bản source của `shared` | `composite: true` + `references` + script `--topological`; chuẩn hoàn thành kiểm `dist/main.js` nằm đúng chỗ |
| DTO ở `apps/api` trôi khỏi interface ở `shared` | `implements` bắt được field thiếu và sai kiểu. **Không** bắt được field thừa ở DTO — chiều trôi này an toàn (cộng thêm) nhưng phải biết nó tồn tại |
| Ai đó camelCase hóa JSON cho "gọn" | Ghi rõ trong ESLint config + review; api-spec là hợp đồng với client |
| Trôi phiên bản giữa hai app | Ghim phiên bản TypeScript và React ở gốc workspace |

## Bảo mật
`.gitignore` phải chặn mọi biến thể `.env`. Không commit khóa API dưới bất kỳ hình thức nào —
khóa Gemini chỉ tồn tại ở backend.

**Swagger ở production: đã hiện thực bằng `SWAGGER_ENABLED`.** `true|1|yes|on` = bật; để trống =
bật khi `NODE_ENV` khác `production`; **giá trị lạ = tắt**. Tắt thì `/api/docs` trả `404 NOT_FOUND`
y như route không tồn tại, không xác nhận là có trang tài liệu. Hai tính chất cố ý: quên set ở
production thì tắt, và gõ sai thì tắt — không biến một lỗi typo thành lộ toàn bộ bề mặt API.

## Tiếp theo
Mở khóa Phase 02 (schema) và Phase 06 (nền tảng mobile).
