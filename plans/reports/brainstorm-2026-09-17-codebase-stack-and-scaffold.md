# Biên bản tư vấn — Chốt stack và dựng code base

**Ngày:** 2026-09-17 · **Lăng kính:** CTO (mặc định) · **Mức:** medium
**Liên quan:** [Kế hoạch 18 phase](../260917-1821-meetio-full-implementation/plan.md) ·
[Kiểm chứng stack](researcher-2026-09-17-stack-verification.md) ·
[Biên bản rà soát stories](brainstorm-2026-09-17-user-stories-review.md)

---

## Commission

"Check doc của dự án và nghiên cứu để lên plan gen code base. Dùng yarn, TypeORM, axios, Zustand,
tách app FE riêng và BE riêng, BE có Swagger config."

**Hiện trạng khi bắt đầu:** 4 tài liệu đặc tả hoàn chỉnh và nhất quán (41 stories · 13 bảng ·
45 endpoints · 8 WS event · 10 error code), một kế hoạch 18 phase toàn bộ `pending`, **không có
dòng code nào**. Greenfield thật.

**Xung đột phải giải:** kế hoạch hiện tại chốt pnpm + Prisma + fetch wrapper. Commission chốt
yarn + TypeORM + axios. Kế hoạch và stack lệch nhau ở 6 file.

---

## Bốn câu hỏi chặn và quyết định

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| 1 | "App FE" là mobile hay web? | **Expo / React Native** | Tài liệu ghi rõ "Mobile App (Android & iOS)". Chọn web sẽ phá Epic E2 (10 stories) và làm NFR-02 "audio không rời thiết bị" sụp đổ — Web Speech API gửi audio lên server Google |
| 2 | Tách FE/BE ở mức nào? | **Monorepo: `apps/` + `packages/shared`** | 45 endpoint + 8 WS payload + 10 error code dùng chung. Hai repo tách rời buộc phải nhân bản kiểu hoặc publish npm package — đúng thứ Phase 01 đã cảnh báo là "nguồn lỗi chắc chắn xảy ra" |
| 3 | Phạm vi "gen code base"? | **Bộ khung chạy được + chuyển 18 phase sang stack mới** | Khung chạy được chứng minh stack trước khi đổ 41 stories lên nó. Sửa luôn phase file để kế hoạch không mâu thuẫn với code |
| 4 | Trạng thái server ở FE? | **axios + TanStack Query + Zustand** | Mỗi thứ một việc. Zustand-only buộc tự viết cache key, dedup, cursor pagination, invalidation cho 45 endpoint — tự làm lại TanStack, bản kém hơn |

---

## Phát hiện từ kiểm chứng

### 1. Swagger CLI plugin không vượt được ranh giới package — **buộc đổi thiết kế**

`@nestjs/swagger` CLI plugin (thứ tự suy ra `@ApiProperty()` từ kiểu TS) **chỉ quét file trong
đúng tsconfig của chính nó**. Không thấy được DTO class import từ `packages/shared`.
Xác nhận qua nestjs/nest#6982, nestjs/swagger#893 (feature request còn mở), nrwl/nx#33337.

Đặt decorator `@ApiProperty()` vào `packages/shared` cũng không được: nó kéo `@nestjs/swagger`
thành dependency truyền vào bundle React Native.

**Cách giải đã chốt — tách hợp đồng khỏi hiện thực:**

```
packages/shared/     CHỈ kiểu. Không decorator, không runtime dep.
                     interface + const enum → biến mất lúc biên dịch.

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

Đổi tên field ở `shared` → `apps/api` báo lỗi biên dịch ngay. Một nguồn sự thật, Swagger đầy đủ,
bundle RN sạch. **TypeORM entity là tầng lưu trữ riêng, không bao giờ lộ ra bề mặt API.**

### 2. TypeORM + pgvector — quyết định đúng, và tốt hơn Prisma cho schema này

- `@Column('vector', { length: 768 })` được hỗ trợ native từ TypeORM **0.3.27**.
  → *Việc đầu tiên khi thi công: ghim và xác nhận phiên bản TypeORM thực tế trước khi viết entity.*
- Xếp hạng cosine: QueryBuilder + toán tử `<=>` dạng chuỗi thô trong `.orderBy()`, tham số qua
  `pgvector.toSql()`. Lai, không phải SQL thô toàn bộ. `find()` **không** làm được.
- **Không có DSL** cho: index HNSW, CITEXT, PG enum, partial index, GIN trigram.
  Toàn bộ phải viết tay bằng `queryRunner.query()` trong migration.
- Hệ quả bắt buộc: **`synchronize: false` vĩnh viễn.** Không ngoại lệ.
- Các PR cũ của TypeORM về vector (#10138, #10789) đã đóng/bỏ **trước khi** hỗ trợ native xuất
  hiện ở 0.3.27 — đừng bị chúng dẫn sai hướng.

**So với Prisma:** schema này có `vector(768)`, HNSW, CITEXT, partial index
(`WHERE deleted_at IS NULL`), GIN trgm trên `unaccent(lower(title))`, 5 PG enum. Prisma cần sửa tay
migration cho gần như tất cả, và phải khai `Unsupported("vector(768)")`. TypeORM migration là TS
thuần nên SQL thô vào tự nhiên. Đổi lại: an toàn kiểu lúc biên dịch yếu hơn Prisma. Đánh đổi xứng đáng.

### 3. Yarn — **ghi rõ chỗ tôi không theo kết quả nghiên cứu**

Nghiên cứu đề xuất Yarn 1 classic (Metro không hiểu PnP; có issue expo/expo#38336 còn mở).

**Quyết định: Yarn 4 + `nodeLinker: node-modules`.** Lý do:
- Friction được dẫn ra là cảnh báo của `expo-doctor`, không phải lỗi install.
- `nodeLinker: node-modules` đưa Yarn 4 về đúng bố cục của Yarn 1, chỉ khác là resolver còn được
  bảo trì.
- Yarn 1 là công cụ đã chết, và hoisting của nó cần `nohoist` chăm sóc liên tục.
- **Chi phí đổi ý = một file lockfile.** Nên rủi ro này rẻ.

**Đối sách:** `yarn install && expo start` là chuẩn hoàn thành **đầu tiên** của Phase 01. Metro giở
quẻ → xóa lockfile, hạ về Yarn 1 + `nohoist`, ghi lại lý do. Đường lùi viết sẵn, không ứng biến.

### 4. TanStack Query v5 trên React Native — không vướng gì

Hỗ trợ RN/Expo có tài liệu chính thức (tích hợp `AppState` / `onlineManager`). Ranh giới phải giữ:
**Zustand không bao giờ giữ dữ liệu server** — chỉ giữ trạng thái phiên ghi cục bộ (seq counter,
hàng đợi local, trạng thái mic, gap tracking) và token auth.

---

## Kiến trúc đã chốt

```
meetio/
├── package.json              yarn 4 workspaces, nodeLinker: node-modules
├── .yarnrc.yml
├── tsconfig.base.json        alias @meetio/shared
├── docker-compose.yml        pgvector/pgvector:pg15 + redis:7
├── .env.example
├── apps/
│   ├── api/                  NestJS · TypeORM · @nestjs/swagger · BullMQ
│   │   ├── src/
│   │   │   ├── common/repositories/scoped.repository.ts    ép user_id
│   │   │   ├── database/vector.repository.ts               cô lập <=>
│   │   │   ├── database/entities/                          13 entity
│   │   │   └── database/migrations/                        SQL viết tay
│   │   └── deploy riêng (Docker)
│   └── mobile/               Expo Router · axios · TanStack Query · Zustand
│       └── build riêng (EAS)
└── packages/
    └── shared/               CHỈ kiểu — 0 runtime dependency
```

**Bất biến phải giữ**

1. `packages/shared` không có runtime dependency. Thêm một cái là bundle RN phình và ranh giới vỡ.
2. `synchronize: false`. Mọi thay đổi schema đi qua migration viết tay.
3. Mọi truy vấn dữ liệu người dùng đi qua `ScopedRepository`. Lint chặn gọi thẳng TypeORM
   repository ngoài tầng repository (quy tắc này Phase 03 đã có, chỉ đổi đích từ Prisma client).
4. **JSON giữ nguyên `snake_case`** đúng như api-spec (`access_token`, `started_at_ms`,
   `meeting_id`). DTO và cột TypeORM đều snake_case. Không ai được "dọn dẹp" thành camelCase.
5. Truy cập tài nguyên không thuộc sở hữu trả **404**, không phải 403.

---

## Phạm vi bộ khung chạy được

**CÓ**

- yarn workspace · tsconfig · ESLint · Prettier · husky · CI
- `docker-compose` cho pgvector + Redis, có `vector`/`unaccent`/`pg_trgm`
- 13 TypeORM entity + migration đầy đủ (vector, HNSW, CITEXT, partial, GIN trgm, 5 enum)
- Swagger UI tại `/api/docs`, sinh từ DTO trong `apps/api`
- Module auth đầu-cuối: register · login · refresh (xoay vòng) · logout
- `ScopedRepository` — bịt IDOR ngay từ nền, không chờ tới lúc có endpoint
- FE shell: Expo Router `(auth)`/`(app)` · axios interceptor refresh single-flight ·
  TanStack Query provider · Zustand session store · expo-secure-store

**CHƯA CÓ** (để 18 phase sau làm): meetings · transcript · WS gateway · dịch · AI pipeline ·
GraphRAG · export.

Không stub rỗng. Cái gì có mặt thì chạy thật — đúng quy tắc dự án.

---

## Việc sửa kế hoạch 18 phase

| File | Sửa gì | Khối lượng |
|------|--------|-----------|
| `plan.md` | Bảng stack: pnpm → yarn, thêm TypeORM + Swagger + axios | nhẹ |
| `phase-01` | pnpm → yarn 4; thêm cấu hình Swagger; quy tắc `shared` chỉ-kiểu; metro `watchFolders`; đường lùi Yarn 1 | trung bình |
| `phase-02` | **Viết lại** toàn bộ: Prisma → TypeORM entity + migration, `synchronize: false`, ghim phiên bản | **nặng** |
| `phase-03` | `ScopedRepository` đổi từ Prisma client sang TypeORM repository; sửa quy tắc lint | nhẹ |
| `phase-06` | `fetch` wrapper → axios interceptor; ghi rõ ranh giới TanStack/Zustand | nhẹ |
| `phase-10` | Ghi rõ axios cho TanStack infinite query | nhẹ |

**Không phải sửa:** `phase-12` trỏ vào `vector.repository.ts` — file đó vẫn tồn tại, chỉ đổi ruột.
`phase-04` trỏ vào `ScopedRepository` — vẫn đúng. **Hai lớp trừu tượng này được vẽ ở đúng độ cao
nên sống sót qua việc đổi ORM mà không phải sửa một chữ.** Đây là bằng chứng kế hoạch gốc vẽ đúng tầng.

---

## Điều phải canh khi thi công

1. **Phiên bản TypeORM.** Hỗ trợ `vector` native mốc 0.3.27. Việc đầu tiên là xác nhận phiên bản
   thật rồi ghim. Sai mốc này thì toàn bộ entity phải viết lại bằng transformer.
2. **Metro + yarn 4.** Chuẩn hoàn thành đầu tiên của Phase 01. Đường lùi Yarn 1 đã viết sẵn.
3. **Rò rỉ ranh giới `packages/shared`.** Một `yarn add` sai chỗ là bundle RN kéo theo code server.
   Nên có kiểm tra CI: `packages/shared/package.json` phải rỗng `dependencies`.
4. **Trôi dạt Swagger.** `implements` chỉ bắt được field thiếu và sai kiểu, không bắt được field
   thừa ở DTO. Chiều trôi này an toàn (cộng thêm) nhưng phải biết là nó tồn tại.
5. **Cổng chặn Phase 00 vẫn còn hiệu lực.** Chọn Expo/RN nghĩa là OQ-01 (giới hạn STT trên thiết
   bị) vẫn là rủi ro khả thi lớn nhất và vẫn chặn Phase 07. Dựng khung **không** phụ thuộc cổng này.

---

## Đo lường thành công

- `yarn install && yarn build` sạch từ thư mục gốc; `expo start` mở được app.
- `docker compose up` cho Postgres có đủ `vector` · `unaccent` · `pg_trgm`.
- Migration chạy tiến → lùi → tiến lại, dữ liệu nguyên vẹn; 13 bảng đủ index.
- Tìm tương đồng vector trên 10.000 chunk giả lập dưới 100ms.
- Swagger UI liệt kê đủ endpoint auth với schema đúng, sinh từ DTO chứ không viết tay.
- Đăng ký → đăng nhập → gọi endpoint có bảo vệ → refresh token → đăng xuất, chạy thật đầu-cuối.
- Sửa một kiểu trong `packages/shared` làm **cả hai** app báo lỗi biên dịch.
- `packages/shared` có `dependencies` rỗng.

---

## Việc tiếp theo

1. Sửa 6 file kế hoạch theo bảng trên (`plan.md`, phase 01/02/03/06/10).
2. Thi công Phase 01 → 02 → 03 → 06 để có bộ khung chạy được.
3. Phase 00 (spike STT) chạy song song — không phụ thuộc bộ khung, nhưng chặn Phase 07.

---

## Còn bỏ ngỏ

- Phiên bản TypeORM chính xác có hỗ trợ `vector` native — phải xác nhận lúc `yarn add`, không tin
  vào con số ghi ở đây.
- `@nestjs/swagger` có thể đã thêm `dtoFilePaths` ở bản rất mới (issue #893 còn mở lúc kiểm chứng).
  Nếu có rồi thì cách giải ở mục 1 vẫn đúng và vẫn nên giữ — tách hợp đồng khỏi hiện thực có giá
  trị riêng, không chỉ để lách giới hạn của plugin.
- Tham số HNSW (`m`, `ef_construction`) chốt bằng số đo ở Phase 02, không bằng phỏng đoán.
- OQ-01 → OQ-04 vẫn mở nguyên như biên bản trước. Bộ khung không trả lời câu nào trong số đó.

---

## Phụ lục — hai quyết định phát sinh khi thi công Phase 01

### A. NestJS 12 (ESM thuần) thay vì 11 (CJS) — **đã chốt: chuyển lên 12**

Phát hiện khi dựng Phase 01, đã tự kiểm chứng lại trên npm registry:

| Bản | `type` | Nhãn npm |
|-----|--------|----------|
| `@nestjs/core@12.0.3` | `module` (ESM thuần) | `latest` |
| `@nestjs/core@11.2.5` | *(không có → CJS)* | **`legacy`** |

Agent thi công ghim 11.x cho an toàn — một lựa chọn hợp lý cho phase nền, và đã báo cáo trung thực
thay vì giấu đi.

**Quyết định của chủ dự án: chuyển lên 12 + ESM ngay.** Lý do quyết định:
**chi phí di trú tỉ lệ thuận với số file.** `apps/api` hiện có 8 file — rẻ nhất lúc này. Đợi tới
Phase 17 là hàng trăm file, cộng thêm rủi ro vỡ runtime khó truy. Dự án greenfield 18 phase không
nên khởi động trên một major đã bị gắn nhãn `legacy`.

**Rủi ro đã nhận diện:** hệ sinh thái ESM còn non — `passport-jwt`, `argon2` (native module),
`@nestjs/throttler`, `bullmq`, `typeorm`. **Đối sách: probe toàn bộ ngay trong lần di trú**, mỗi thư
viện phải chạy thật chứ không chỉ import được. Đây mới là giá trị thật của việc làm sớm: phát hiện
thư viện chặn đường ở Phase 01 thay vì Phase 11.

### B. Lỗ hổng mã lỗi chung ở api-spec §9 — **đã sửa**

Phase 01 làm lộ ra một khiếm khuyết trong chính đặc tả: **§9 không có mã lỗi chung nào.** Không có
`NOT_FOUND`, không có `VALIDATION_ERROR`, không có `INTERNAL_ERROR`. Hệ quả là bộ lọc ngoại lệ toàn
cục buộc phải lấy mã theo miền làm mặc định:

```
GET /api/nope        → MEETING_NOT_FOUND   ← URL gõ sai mà báo "không tìm thấy cuộc họp"
lỗi validate 400     → PROCESSING_FAILED   ← báo pipeline AI hỏng
server sập 500       → PROCESSING_FAILED   ← cũng vậy
```

`PROCESSING_FAILED` được đặc tả là 422 "pipeline lỗi, kèm `details.step`". Đẩy mọi lỗi chưa phân
loại vào đó khiến client đi nhầm nhánh phục hồi — thử lại theo kiểu pipeline trong khi thực ra
server sập. Và Phase 03 sẽ dính ngay từ ngày đầu: mọi lỗi validate đăng ký/đăng nhập đều trả
`PROCESSING_FAILED`.

**Đã sửa:** thêm `VALIDATION_ERROR` (400) · `NOT_FOUND` (404) · `INTERNAL_ERROR` (500) vào
api-spec §9, kèm **quy tắc mã mặc định**: bộ lọc toàn cục không bao giờ được đoán mã theo miền từ
HTTP status. Mã theo miền chỉ phát khi tầng nghiệp vụ chủ động ném ra.

Sửa đồng bộ ở ba nơi: `docs/api-spec.md` §9 · `packages/shared/src/enums/api-error-code.ts` ·
`apps/api/src/common/filters/api-exception.filter.ts`. Test tăng từ 4 lên 7, trong đó có một test
hồi quy chứng minh tầng nghiệp vụ **vẫn** phát được `MEETING_NOT_FOUND` tường minh trên 404 — tức
là quy tắc "trả 404 thay vì 403" ở US-03 không bị mã chung nuốt mất.

### C. Đính chính tài liệu: `packages/shared` cần bước build

Bản đầu của biên bản này và Phase 01 viết "`packages/shared` … biến mất lúc biên dịch". **Chỉ đúng
một nửa.** Interface thì biến mất, nhưng enum viết dạng const-object là **giá trị runtime thật**.
Nên `shared` có bước build, `main` trỏ vào `dist/`, và dùng TypeScript project references.

**Bất biến "0 runtime dependency" không đổi** — "có bước build" khác với "có runtime dependency".
Chỉ cái thứ hai mới kéo code server vào bundle React Native.

---

## Phụ lục 2 — kết quả di trú ESM và probe hệ sinh thái

Di trú `apps/api` sang NestJS 12 + ESM đã xong. `dist/main.js` sinh ra ESM thật (`import`, đuôi
`.js`), app boot được, Swagger 200, envelope lỗi trả `NOT_FOUND` đúng như đã sửa. 38 test xanh.

### Probe hệ sinh thái — toàn bộ PASS

| Thư viện | Bản | Kết quả | Dùng ở phase |
|----------|-----|---------|--------------|
| `typeorm` + `@nestjs/typeorm` + `pg` | 1.1.1 / 12.0.1 / 8.23.0 | PASS | 02, 03 |
| `pgvector` | 0.3.0 | PASS — `toSql()` chạy thật | 12 |
| `@nestjs/jwt` + `passport-jwt` + `@nestjs/passport` | 12.0.2 / 4.0.1 / 12.0.0 | PASS — strategy khởi tạo được | 03 |
| `argon2` | 0.45.1 | PASS — hash/verify round-trip thật dưới `"type":"module"` | 03 |
| `@nestjs/throttler` | 6.7.0 | PASS — DI container dựng được | 03, 16 |
| `bullmq` + `@nestjs/bullmq` | 6.3.6 / 12.0.0 | PASS **kèm phát hiện** — xem dưới | 11 |
| `class-validator` + `class-transformer` | 0.15.1 / 0.5.1 | PASS — qua `ValidationPipe` thật | mọi phase |

`argon2` là native module và là rủi ro ESM cao nhất — nó chạy được. Đây chính là lý do làm probe
ngay: nếu nó vỡ, quyết định Nest 12 phải xét lại **trước** Phase 03, không phải giữa chừng.

### Phát hiện phải mang sang Phase 11

**`bullmq` không tự nạp được `ioredis` trong môi trường ESM thuần.** Đường `connection: {host, port}`
của bullmq gọi `require('ioredis')` bên trong, và lời gọi đó không giải được từ một ES module.
bullmq tự ném ra lỗi chỉ đúng tình huống này.

**Đối sách cho Phase 11:** thêm `ioredis` làm dependency tường minh, tự dựng client rồi truyền
**instance đã dựng sẵn** vào `connection`, đừng truyền object tùy chọn.

### Đính chính về TypeORM — sửa cả báo cáo nghiên cứu lẫn Phase 02

Bản nghiên cứu ban đầu và Phase 02 đều bám mốc "TypeORM 0.3.27". **Đã lỗi thời.**

- npm `latest` của `typeorm` là **1.1.1**; `0.3.31` mới là nhánh `legacy`.
- TypeORM 1.1.1 **là gói lai (dual-format)**, không phải ESM-only: không có trường `"type"`,
  `main` trỏ CJS, `exports` có cả `node.import` lẫn `node.require`. Nên nó hợp với `apps/api` (ESM)
  mà không cần thủ thuật.
- **Quan trọng nhất:** đối chiếu trực tiếp `node_modules/typeorm/**/*.d.ts` cho thấy bảng "không có
  DSL" trong Phase 02 **sai ở 4 trên 7 dòng**. TypeORM 1.1.1 khai báo được bằng decorator:
  `vector` (cùng `halfvec`, `half_vector`, `real_vector`), `citext`, PG enum, partial index
  (`{ where }`), GIN trên cột thường (`{ type: 'gin' }`).
- **Chỉ còn ba thứ thật sự cần SQL thô:** index HNSW (`TableIndexTypes` không có `hnsw`), index GIN
  theo biểu thức `unaccent(lower(title))` (không hỗ trợ biểu thức lẫn opclass), và `CREATE EXTENSION`.

Phase 02 đã được sửa lại theo sự thật đo được. Bài học: **mốc phiên bản trong một bản nghiên cứu
có hạn sử dụng.** Đối chiếu `.d.ts` thật trong `node_modules` đáng tin hơn mọi con số chép lại.

### Khiếm khuyết đặc tả thứ hai — `notification_settings` (đã sửa)

Phase 06 phát hiện: `PATCH /users/me` nhận `notification_settings`, nhưng `GET /users/me` không trả
lại, và bảng `users` **không có cột nào** để lưu. Client ghi được một giá trị mà không bao giờ đọc
lại được — màn hình cài đặt buộc phải đoán mặc định.

Đã sửa ba tầng: cột `notification_settings` JSONB trong `docs/data-model.md` · `GET /users/me` khai
rõ phải trả về trong `docs/api-spec.md` §2 · thêm vào `PublicUser` ở `packages/shared`.
Kèm nguyên tắc chung: **trường nào `PATCH` sửa được thì `GET` phải đọc lại được.**

### Việc còn treo

- `nest start --watch` (dev hot-reload) chưa kiểm dưới ESM. `start:prod` (`node dist/main.js`, tức
  đường production thật) đã kiểm và chạy. Phase nào cần dev-watch thì thử trước.
- Ba chuẩn hoàn thành của Phase 06 còn treo, có lý do chính đáng: đăng nhập thật đầu-cuối (chờ
  Phase 03) · khởi động lạnh dưới 2 giây (cần máy thật để đo) · hiển thị dấu tiếng Việt trên thiết
  bị thật (Jest không với tới).

---

## Phụ lục 3 — bộ khung đã hoàn tất, và những gì kiểm chứng độc lập moi ra

**85 test xanh** (54 API + 31 mobile). Phase 01 · 02 · 03 · 06 xong.

Mỗi phase đều được kiểm chứng lại độc lập, không tin báo cáo của agent. Đây là những thứ chỉ lộ ra
khi tự chạy lại — không cái nào bị agent giấu, nhưng cũng không cái nào tự nổi lên từ test xanh:

### 1. `/api/health` bị khóa sau xác thực — **hồi quy, đã sửa**

Phase 03 gắn `JwtAuthGuard` toàn cục và nuốt luôn `/api/health`: từ 200 (Phase 01–02) thành **401**.
Chính docstring của controller ghi "Unauthenticated liveness probe" — code mâu thuẫn với tài liệu
của chính nó.

**Vì sao test không bắt được:** unit test gọi thẳng vào controller, không đi qua guard. Nên nó xanh
trong khi endpoint thật đã hỏng.

**Vì sao nghiêm trọng:** đây là đầu dò liveness/readiness cho Docker, Kubernetes và load balancer —
không cái nào mang theo JWT. Deploy lên là mọi health check trượt, trong khi CI vẫn xanh.

Đã sửa: `@Public()` cho `HealthController`, **kèm một test hồi quy đọc metadata** để không tái diễn.
Đã xác minh lại trên server thật: `/api/health` → 200, `/api/users/me` → 401 (không mở nhầm thêm gì).

### 2. Chuẩn hiệu năng vector đạt vì quét tuần tự, không phải vì index

Xem chi tiết ở [Phase 02](../260917-1821-meetio-full-implementation/phase-02-database-schema.md).
Tóm tắt: index HNSW nhanh hơn 80 lần (0,245ms so với 20,7ms) nhưng **planner không chọn nó** ở quy
mô 10k dòng. Chuẩn "dưới 100ms" đạt nhờ brute force. Quét tuần tự tăng tuyến tính → 1 triệu chunk
mất khoảng 2 giây. Đã siết chuẩn nghiệm thu: `EXPLAIN` **phải** hiện `Index Scan`, không chỉ đo giờ.

### 3. Cấu hình chết trong `.env` — đã gỡ

`JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` chỉ được nhắc trong một dòng comment, không chỗ nào đọc. Tệ
hơn: `.env` ghi 30 ngày trong khi code thực thi đúng 60 ngày theo api-spec §1. Ai sửa `.env` sẽ tin
là mình vừa đổi vòng đời token — và không có gì xảy ra.

Đã gỡ khỏi `.env` và `.env.example`. **Cấu hình im lặng không làm gì còn tệ hơn không có cấu hình,
vì nó trông như một cái cần gạt đang hoạt động.**

### 4. `start` không nạp `.env` trong khi `migration:run` thì có

`node dist/main.js` chết ngay với `DATABASE_URL is required`. Đã thêm `--env-file` cho `start` /
`start:dev` và thêm `start:local` cho việc chạy bản build tại máy.

### Điểm cộng của agent Phase 03 — vượt yêu cầu

`TIMING_SAFETY_PASSPHRASE`: băm sẵn một passphrase cố định lúc khởi động, để một lần đăng nhập vào
email không tồn tại vẫn phải trả đúng chi phí argon2 như email có thật. Bịt kênh phụ thời gian cho
phép dò email. Không nằm trong yêu cầu — agent tự nhận ra và làm.

### Xác minh an ninh trực tiếp (tự chạy, không dựa vào báo cáo)

| Kiểm tra | Kết quả |
|----------|---------|
| Khóa trả về khi đăng ký | đúng `access_token, refresh_token, user` — **0 lần rò `password_hash`/`token_hash`** |
| Endpoint có bảo vệ | 200 có token · 401 không token · 401 token rác |
| Xoay vòng refresh token | chạy |
| **Phát lại RT1 đã bị xoay** | **401** |
| **RT2 hợp lệ sau khi phát hiện trộm** | **401 — cả chuỗi bị thu hồi** |
| Lỗi validate | `VALIDATION_ERROR` |
| Route không tồn tại | `NOT_FOUND` |

Phát hiện trộm token hoạt động đúng: thu hồi **cả họ token**, không chỉ cái bị phát lại.

### Còn treo — nói rõ thay vì đánh dấu xong

- **Quét IDOR chéo người dùng chỉ làm được một nửa.** Phase 03 không có endpoint nào nhận id tài
  nguyên của người khác (`/users/me*` lấy id từ `sub` trong JWT). Bằng chứng hiện tại là 8 unit test
  của `ScopedRepository`. **Quét thật đầu-cuối phải làm ở Phase 04** khi `meetings/:id` xuất hiện.
- `nest start --watch` chưa kiểm dưới ESM.
- Ba chuẩn của Phase 06 còn treo: đăng nhập thật trên thiết bị, khởi động lạnh dưới 2s, hiển thị dấu
  tiếng Việt trên máy thật.
- **OQ-01 → OQ-04 vẫn mở nguyên.** Bộ khung không trả lời câu nào. Phase 00 (spike STT) vẫn là cổng
  chặn cứng của Phase 07.
