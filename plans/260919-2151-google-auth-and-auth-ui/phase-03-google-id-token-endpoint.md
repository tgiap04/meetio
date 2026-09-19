---
phase: 03
title: "Xác minh ID token + POST /auth/google + liên kết tài khoản"
status: completed
priority: P1
effort: 3.5h
blockedBy: [01, 02]
blocks: [11, 12]
---

# Phase 03 — Xác minh ID token Google + `POST /auth/google`

**Liên kết:** [plan.md](plan.md) · [decisions §1 (`sub` là khóa nối)](decisions.md) ·
[decisions §3 (`email_verified` là cổng)](decisions.md) · [decisions §4 (xóa mềm)](decisions.md) ·
[decisions §5 (tách service)](decisions.md) · [decisions §6 (`google-auth-library@10`)](decisions.md) ·
[decisions §7 (thiếu cấu hình)](decisions.md) · [file-ownership.md](file-ownership.md) ·
[api-spec §1/§9/§10](../../docs/api-spec.md) ·
[Báo cáo stack](../reports/researcher-2026-09-19-google-signin-stack.md)

## Tổng quan

Nhận một chuỗi ID token từ client, **tự mình chứng minh nó do Google ký và dành cho ta**, rồi biến
các claim đã xác minh thành một phiên Meetio — bằng **đúng bộ phát token** mà đăng nhập mật khẩu
đang dùng.

Đây là phase duy nhất trong kế hoạch tin vào dữ liệu đến từ ngoài, nên nó là phase duy nhất có mục
bảo mật dài.

## Nhận định then chốt

- **Ba lớp, tách theo khả năng test:**

  | File | Việc | Test bằng gì |
  |---|---|---|
  | `google-identity.ts` | hàm **thuần**: kiểm `email_verified`/`sub`/`email`, chuẩn hóa claim | gọi trần, không mock |
  | `google-token-verifier.ts` | bọc `OAuth2Client.verifyIdToken`, đọc audience từ config | client giả tiêm vào |
  | `google-auth.service.ts` | ba nhánh tra cứu + liên kết + đua `23505` | repo mock, đúng khuôn `auth.service.spec.ts` |

  Không test nào chạm mạng. Vòng đi-về thật với Google là **bước nghiệm thu trên máy của người
  dùng** ở phase 11 — chúng ta không kiểm được, và kế hoạch nói thẳng điều đó.
- **`GoogleAuthService` tách khỏi `AuthService`** vì hai lý do đo được: `auth.service.ts` đã ~175
  dòng sau phase 02, và phase 02 đã sở hữu file đó (decisions §5).
- **Throttle kế thừa tự động.** `@UseGuards(ThrottlerGuard)` và `@Throttle({default:{limit:10,ttl:60000}})`
  nằm ở **cấp class** của `AuthController`, nên `@Post('google')` nhận đúng 10 lần/phút/IP mà không
  cần khai gì thêm. Phải có test khóa điều đó, không phải tin (xem AC #7).

## Yêu cầu

**Chức năng**

1. `google-identity.ts` — kiểu + hàm thuần:
   ```ts
   export interface GoogleIdentityClaims {
     sub: string;
     email: string;
     display_name: string;   // từ `name`, lùi về phần trước '@' của email
   }
   /** Ném GOOGLE_EMAIL_UNVERIFIED / GOOGLE_TOKEN_INVALID; không bao giờ trả claim nửa vời. */
   export function toGoogleIdentity(payload: TokenPayload): GoogleIdentityClaims
   ```
2. `google-token-verifier.ts` — `@Injectable() GoogleTokenVerifier`:
   - đọc `GOOGLE_OAUTH_AUDIENCES` (phân tách bằng dấu phẩy, trim, bỏ rỗng) qua `ConfigService`;
   - `isConfigured(): boolean`;
   - `verify(idToken: string): Promise<GoogleIdentityClaims>` — gọi
     `client.verifyIdToken({ idToken, audience })`, lấy `getPayload()`, chuyển qua `toGoogleIdentity`;
   - mọi lỗi từ thư viện ⇒ `UnauthorizedException` với `GOOGLE_TOKEN_INVALID`. **Không để nguyên
     message của thư viện lọt ra ngoài** — nó mô tả claim nào sai, tức là một oracle nhỏ.
3. `google-auth.service.ts` — `signIn(idToken)`:
   ```
   claims = verifier.verify(idToken)          # cổng email_verified nằm bên trong, xem §Bảo mật
   u = users.findOne({ google_sub: claims.sub })
   if u && u.deleted_at  → throw UNAUTHORIZED
   if u                  → return auth.issueTokenPairWithUser(u)
   u = users.findOne({ email: claims.email })          # KHÔNG lọc deleted_at ở câu này
   if u && u.deleted_at  → throw UNAUTHORIZED
   if u                  → u.google_sub = claims.sub; save; return issue(u)     # liên kết
   return issue(create({ email, google_sub, password_hash: null, display_name, …mặc định như register }))
   ```
   Bọc hai lời `save` bằng bắt lỗi Postgres `23505`: đọc lại theo `google_sub` rồi `email`, thấy thì
   đi tiếp, không thấy thì ném lại.
4. `dto/google-sign-in.dto.ts` — `GoogleSignInDto implements GoogleSignInRequest`, `@IsString()`
   `@IsNotEmpty()` trên `id_token`. **Đúng một trường.**
5. `auth.controller.ts` — `@Public() @Post('google') @HttpCode(200) @ApiOkResponse({type: AuthTokenPairDto})`.
6. `auth.module.ts` — thêm `GoogleTokenVerifier` và `GoogleAuthService` vào `providers`.
7. `main.ts` — một dòng log khởi động nói Google bật hay tắt, đúng khuôn dòng Swagger sẵn có.
8. `apps/api/package.json` — `google-auth-library@^10.9.1` (**không phải v11**, decisions §6).

**Phi chức năng**

- ESM thuần: mọi import tương đối có đuôi `.js` tường minh.
- Mỗi file < 200 dòng. Ước lượng: verifier ~70, identity ~50, service ~120.
- JSON trên dây giữ `snake_case`.

## Luồng dữ liệu

```
 client
   │ POST /api/auth/google  { id_token }
   ▼
 ThrottlerGuard (class-level, 10/phút/IP)        ← kế thừa, không khai lại
   ▼
 ValidationPipe(whitelist:true)                  ← cắt sạch mọi trường ngoài id_token
   ▼
 AuthController.googleSignIn
   ▼
 GoogleTokenVerifier.verify
   ├─ OAuth2Client.verifyIdToken  → chữ ký (JWKS) · iss · aud · exp
   └─ toGoogleIdentity            → email_verified · sub · email      ← CỔNG
   ▼  GoogleIdentityClaims (đã xác minh; đây là nguồn sự thật duy nhất)
 GoogleAuthService.signIn
   ├─ tra google_sub  ─┐
   ├─ tra email       ─┼─► User
   └─ tạo mới         ─┘
   ▼
 AuthService.issueTokenPairWithUser   ← đúng hàm mà login/register gọi
   ▼
 { access_token, refresh_token, user }            (AuthTokenPair, không kiểu mới)
```

Chú ý một điều không có trong sơ đồ: **`id_token` không được ghi log ở bất kỳ đâu**, và không được
lưu. Nó là bearer credential trong ~1 giờ.

## File liên quan

Tạo: `google-identity.ts` + `.spec.ts` · `google-token-verifier.ts` + `.spec.ts` ·
`google-auth.service.ts` + `.spec.ts` · `dto/google-sign-in.dto.ts` · `auth.controller.spec.ts`
(tất cả dưới `apps/api/src/auth/`)
Sửa: `auth.controller.ts` · `auth.module.ts` · `main.ts` · `apps/api/package.json` · `yarn.lock`

## Các bước triển khai

1. `yarn workspace @meetio/api add google-auth-library@^10.9.1`; xác nhận `npm view` đúng
   `engines.node: >=18` trước khi commit lockfile.
2. `google-identity.ts` + spec **trước** (hàm thuần, TDD sạch nhất ở đây).
3. `google-token-verifier.ts` + spec, tiêm `OAuth2Client` giả.
4. `google-auth.service.ts` + spec, dùng lại `createUsersRepoMock()`/`fakeUser()` từ
   `auth.service.spec.ts` (sao chép khuôn, không import chéo file spec).
5. DTO → controller → module → `main.ts`.
6. `auth.controller.spec.ts` khóa việc throttle kế thừa.
7. `yarn workspace @meetio/api run openapi:generate` — CI có cổng này.

## Todo

- [ ] `google-auth-library@^10.9.1`
- [ ] `toGoogleIdentity` + spec (đủ 5 nhánh từ chối)
- [ ] `GoogleTokenVerifier` + spec (audience dạng mảng · `isConfigured` · nuốt message thư viện)
- [ ] `GoogleAuthService.signIn` + spec (3 nhánh × xóa mềm × đua `23505`)
- [ ] `GoogleSignInDto`
- [ ] Route + module + log khởi động
- [ ] `auth.controller.spec.ts` khóa throttle
- [ ] `openapi:generate` xanh

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn test` | thoát 0 |
| 2 | `toGoogleIdentity từ chối payload có email_verified: false` | ném `GOOGLE_EMAIL_UNVERIFIED` |
| 3 | `toGoogleIdentity từ chối payload thiếu sub` / `thiếu email` / `email_verified: undefined` | ném `GOOGLE_TOKEN_INVALID` |
| 4 | `GoogleTokenVerifier truyền audience dạng mảng đã tách từ GOOGLE_OAUTH_AUDIENCES` | client giả nhận `['id-1','id-2']` |
| 5 | `GoogleTokenVerifier không để message của thư viện lọt ra envelope` | message trả về là chuỗi tiếng Việt của ta, không chứa `'aud'`/`'iss'`/`'Token used too late'` |
| 6 | `GoogleTokenVerifier.isConfigured() === false khi GOOGLE_OAUTH_AUDIENCES rỗng`, và route trả `INTERNAL_ERROR` | pass |
| 7 | `auth.controller.spec` — handler `googleSignIn` **không** có `@Throttle` cấp method, và class mang limit 10 / ttl 60000 | pass (đọc bằng `Reflect.getMetadata` trên class và trên method) |
| 8 | `signIn tra google_sub trước email` — user có `google_sub` khớp nhưng email **khác** vẫn đăng nhập được | pass |
| 9 | `signIn tự liên kết khi email trùng tài khoản mật khẩu` — `google_sub` được ghi, `password_hash` **giữ nguyên** | pass |
| 10 | `signIn tạo tài khoản mới với password_hash null` | pass |
| 11 | `signIn từ chối khi tài khoản trùng đang xóa mềm` (cả nhánh `google_sub` lẫn nhánh `email`) | ném `UNAUTHORIZED` |
| 12 | `signIn không bao giờ đọc email/sub từ body` — spec gọi service với claims giả khác hẳn body | pass |
| 13 | `signIn xử lý được đua: save đầu ném 23505, đọc lại thấy hàng, trả token` | pass |
| 14 | `phiên Google xoay vòng refresh y hệt phiên mật khẩu`: `signIn` → `refresh` → dùng lại token cũ ⇒ **cả họ bị thu hồi** | pass |
| 15 | `signIn trả đúng hình dạng AuthTokenPair` (3 khóa, `user` là `PublicUserDto`, **không** có `password_hash`) | pass |
| 16 | `yarn workspace @meetio/api run openapi:generate` | thoát 0, `openapi.json` có `/auth/google` |
| 17 | `grep -rn "id_token" apps/api/src \| grep -i "log"` | không kết quả |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Tin `aud` là web client ID — báo cáo đánh dấu chỗ này **Medium confidence**, không phải sự thật đã dẫn nguồn | Trung × Cao | `audience` nhận **mảng**; `.env.example` ghi rõ có thể liệt kê nhiều ID. Sai thì sửa biến môi trường, **không phải sửa code** |
| Hai request đồng thời cho email mới ⇒ va `UNIQUE` | Thấp × Trung | Bắt `23505`, đọc lại, đi tiếp. AC #13 |
| Message của `google-auth-library` lọt ra ngoài thành oracle | Trung × Trung | AC #5 khóa |
| `verifyIdToken` gọi mạng trong test ⇒ test chậm/flaky | Trung × Trung | Client giả tiêm qua constructor; không test nào chạm mạng |
| CI không có `GOOGLE_OAUTH_AUDIENCES` ⇒ app không boot | Thấp × Cao | Decisions §7: **không** chặn boot. AC #6 khóa |
| Ai đó thêm `offlineAccess`/`serverAuthCode` "cho chắc" | Thấp × Thấp | Không cần: chỉ xác thực, không gọi API thay người dùng. Bật lên là thêm một màn xin quyền vô ích |

## Bảo mật

### 1. Vì sao máy chủ phải **tự** xác minh, và không bao giờ tin email hay user id do client gửi

Client là thiết bị của người khác. Một máy đã root, một bản APK đóng gói lại, hay đơn giản là một
lệnh `curl`, đều gửi được JSON bất kỳ tới `/api/auth/google`. Nếu máy chủ đọc `email` từ body, thì
**gõ email của người khác là đăng nhập được vào tài khoản của họ** — không cần mật khẩu, không cần
token, không cần gì cả.

Thứ duy nhất không giả được là **chữ ký RS256 của Google** trên ID token, kiểm bằng khóa công khai
Google tự xuất bản. Nên hợp đồng chỉ có **một trường** (`id_token`), và mọi sự thật về danh tính —
`sub`, `email`, `email_verified`, `name` — đều đọc từ **payload đã xác minh**, không từ body.

Hai lớp cùng ép điều này:
- `GoogleSignInRequest` chỉ khai `id_token` (phase 01);
- `ValidationPipe({ whitelist: true })` ở `main.ts:20` **cắt bỏ** mọi thuộc tính không có trên DTO,
  nên client gửi kèm `"email": "victim@…"` thì trường đó biến mất trước khi controller chạy.

AC #12 khóa điều này bằng test: service nhận claims khác hẳn body và phải đi theo claims.

### 2. Claim nào được kiểm, và giá trị kỳ vọng chính xác

| Claim | Giá trị kỳ vọng | Ai kiểm |
|---|---|---|
| chữ ký | RS256, khớp khóa công khai tại `https://www.googleapis.com/oauth2/v3/certs` (thư viện tự tải, tự cache, tự xoay khóa) | `verifyIdToken()` |
| `iss` | `accounts.google.com` **hoặc** `https://accounts.google.com` | `verifyIdToken()` |
| `aud` | thuộc danh sách `GOOGLE_OAUTH_AUDIENCES` (web client ID; **mảng**, để thêm client web sau này không phải sửa code) | `verifyIdToken({audience})` |
| `exp` | còn hạn tại thời điểm kiểm | `verifyIdToken()` |
| `email_verified` | **`=== true`**, so sánh nghiêm ngặt. `undefined`/`false`/`"true"` đều **trượt** | `toGoogleIdentity` |
| `email` | có mặt, khác rỗng | `toGoogleIdentity` |
| `sub` | có mặt, khác rỗng — đây là **khóa nối** | `toGoogleIdentity` |

**Cố ý không kiểm:**
- `hd` — chỉ dùng khi giới hạn đăng nhập theo một domain Workspace. Meetio là đăng nhập phổ thông.
- `nonce` — thư viện native không cấp nonce cho luồng này, nên không có gì để đối chiếu. Hệ quả
  thật: một ID token **bị lộ** có thể phát lại trong vòng đời ~1 giờ của nó. Cái làm hẹp lại là
  token chỉ đi qua TLS và không được ghi log ở đâu (AC #17). Ghi vào [mục còn mở](plan.md).
- `azp` — chỉ có nghĩa trong ủy quyền nhiều client, không phải hình trạng của ta.

### 3. Kịch bản chiếm tài khoản mà `email_verified` chặn — kể cụ thể

Bối cảnh: **Linh** đã có tài khoản Meetio bằng email + mật khẩu, địa chỉ
`linh@congty-khach-hang.vn`, với toàn bộ transcript và đồ thị tri thức nhiều tháng họp.

Không có cổng:

1. **Mallory** lập một Google account (hoặc một tài khoản Workspace trên domain cô ta cầm console)
   mà email hồ sơ là `linh@congty-khach-hang.vn`. Có những loại tài khoản Google phát ID token với
   `email_verified: false` — nghĩa là Google đang nói **"đây là địa chỉ khai báo, chúng tôi chưa xác
   minh người này sở hữu nó"**. Chính Google khuyến cáo phải thêm thử thách khác trong trường hợp đó.
2. Mallory bấm "Tiếp tục với Google" trong Meetio. Token hợp lệ về mặt chữ ký: Google **có** ký nó.
3. Máy chủ tra theo email, thấy hàng của Linh, tự liên kết `google_sub` của Mallory vào đó, và phát
   một `AuthTokenPair` **đầy đủ quyền** cho tài khoản của Linh.
4. Mallory đọc được mọi cuộc họp, mọi transcript, mọi action item; xóa được tài khoản. Linh **không
   thấy gì cả**: mật khẩu không đổi, không có email cảnh báo (sản phẩm chưa có đường gửi email nào),
   và Mallory từ đây vào bằng Google nên không cần biết mật khẩu.

Có cổng: bước 3 không tồn tại. `email_verified !== true` ⇒ ném ngay `GOOGLE_EMAIL_UNVERIFIED`, và —
quan trọng — **cổng đứng trước cả câu truy vấn theo email**, nên không hàng `users` nào bị đọc.
Mallory thậm chí không biết `linh@congty-khach-hang.vn` có tồn tại trong Meetio hay không.

Cổng cũng phải đứng trước **nhánh tạo mới**, không chỉ nhánh liên kết. Nếu chỉ chặn liên kết:
Mallory dùng token chưa xác minh tạo một tài khoản Meetio **mang email của Linh** trước khi Linh
kịp đăng ký; sau đó Linh đăng ký sẽ nhận `already_registered` — **từ chối dịch vụ ngay trên chính
địa chỉ email của cô**. Nên trong code cổng nằm trong `toGoogleIdentity`, tức là **trước mọi thứ**,
không phải một `if` rải ở hai nhánh.

### 4. Giới hạn tần suất

`/auth/*` đã bị chặn **10 lần/phút/IP** bởi `@UseGuards(ThrottlerGuard)` + `@Throttle(...)` đặt ở
**cấp class** của `AuthController` (api-spec §10). Decorator cấp class áp cho **mọi** handler, kể cả
handler thêm sau, nên `@Post('google')` **kế thừa nguyên** mà không cần khai gì. Đếm nằm trong Redis
(`RedisThrottlerStorage`) nên chung cho mọi tiến trình.

Khẳng định bằng test, không bằng niềm tin: AC #7 đọc metadata và đòi (a) class mang limit 10 /
ttl 60000, (b) handler `googleSignIn` **không** có `@Throttle` riêng đè lên.

Hệ quả thật, ghi nhận và chấp nhận: sau NAT văn phòng, 10 lượt đăng nhập/phút là chia chung cho cả
văn phòng. Giống hệt `/auth/login` hôm nay, nên không phải hồi quy do phase này gây ra.

### 5. Refresh token của phiên Google: **giống hệt**, không có ngoại lệ nào

`GoogleAuthService` kết thúc bằng `AuthService.issueTokenPairWithUser(user)` — **đúng phương thức**
mà `register()` và `login()` gọi. Nên phiên Google nhận:

- refresh token dùng một lần, **xoay vòng mỗi lần dùng**;
- cùng `family_id` để truy vết chuỗi xoay;
- TTL 60 ngày, access token 15 phút (`auth.constants.ts`, là hợp đồng với api-spec §1);
- **dùng lại một token đã xoay ⇒ thu hồi cả họ**, hiểu là tín hiệu trộm token;
- `POST /auth/logout` thu hồi đúng refresh token gắn với `jti` trong access token.

`refresh()` và `logout()` **không biết và không cần biết** phiên bắt đầu bằng gì — chúng khóa theo
`refresh_tokens.id` / `token_hash`, không theo provider. Vì vậy phase này **không sửa một dòng nào**
trong `auth.service.refresh/logout`, và AC #14 chứng minh hành vi chống trộm vẫn nguyên vẹn trên một
phiên khởi sinh từ Google.

### 6. Rò rỉ khác đã cân nhắc

- **Liệt kê tài khoản qua `/auth/google`:** không có. Cả ba nhánh (đăng nhập, liên kết, tạo mới) đều
  trả `200` + `AuthTokenPair`. Người ngoài không đọc được từ phản hồi là email đó đã tồn tại chưa.
- **Message lỗi của thư viện:** nuốt hết, thay bằng một câu của ta (AC #5). `"Token used too late"`
  hay `"Wrong recipient"` nói cho kẻ dò biết claim nào sai.
- **Ghi log:** không log `id_token`, không log `sub`, không log email trong đường thành công. AC #17.
- **`client_secret`:** không tồn tại trong luồng này. Ta chỉ **xác minh** một token đã ký, không đổi
  mã lấy token. Không có bí mật nào của Google cần lưu ở máy chủ.

## Đường lùi

Gỡ `@Post('google')` khỏi controller (một khối), hoặc đơn giản là **để trống
`GOOGLE_OAUTH_AUDIENCES`** — route lập tức từ chối, phần còn lại của API không hề hấn. Không có
migration nào trong phase này. Tài khoản chỉ-Google đã tạo thì vẫn tồn tại và vẫn bị `CHECK` của
phase 02 giữ hợp lệ, nhưng **không đăng nhập được** cho tới khi bật lại — hệ quả này phải nói với
người dùng trước khi lùi.

## Tiếp theo

Mở khóa **11** (env + README + QA máy thật) và **12** (xóa tài khoản cho người chỉ-Google, cắt được).
