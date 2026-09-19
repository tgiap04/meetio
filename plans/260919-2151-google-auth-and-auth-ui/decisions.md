# Quyết định thiết kế — Đăng nhập Google + màn auth

Mỗi mục ghi **chọn gì · vì sao · cái giá đã chấp nhận**. Đây là nơi duy nhất giữ lý do; phase file
chỉ trỏ về đây.

---

## 1. Khóa nối là `sub`, không phải email

Google nói thẳng trong tài liệu backend-auth: *"This ID is unique to each Google Account, making it
suitable for use as a primary key during account lookup. Email is not a good choice because it can
be changed by the user."*

Nên thứ tự tra cứu trong `GoogleAuthService` là **`google_sub` trước, email sau**:

| Bước | Truy vấn | Kết quả |
|---|---|---|
| 1 | `users WHERE google_sub = sub` | thấy ⇒ đăng nhập luôn, không đụng tới email |
| 2 | `users WHERE email = email AND deleted_at IS NULL` | thấy ⇒ **liên kết** (đặt `google_sub`) |
| 3 | — | không thấy ⇒ **tạo mới** |

Bước 1 đứng trước có một hệ quả cụ thể: người đã liên kết rồi mà **đổi email bên Google** vẫn đăng
nhập được bình thường, vì ta không hỏi email nữa.

### Không đồng bộ email từ Google sau lần liên kết đầu

Cám dỗ là "email Google đổi thì cập nhật luôn cho khớp". **Không làm.** `users.email` là `CITEXT
UNIQUE`; nếu email mới của Google trùng một tài khoản khác đang tồn tại, câu `UPDATE` sẽ vỡ
`UNIQUE` **giữa một luồng đăng nhập** — biến một lần đăng nhập bình thường thành lỗi 500, và vẫn
không có câu trả lời đúng cho "hai tài khoản giờ cùng email thì ai giữ".

Cái giá: `users.email` của người đã liên kết có thể **cũ** so với Google. Chấp nhận được, vì email
đó chỉ còn dùng để hiển thị và để đăng nhập bằng mật khẩu (nếu có) — không còn là khóa nhận dạng
Google nữa.

---

## 2. Không thêm cột `provider`

Bản phác thảo ban đầu có ba thứ: `password_hash` nullable, `google_sub`, và `provider`. Bỏ
`provider`.

| Câu hỏi | Trả bằng gì |
|---|---|
| Tài khoản này đăng nhập mật khẩu được không? | `password_hash IS NOT NULL` |
| Tài khoản này đăng nhập Google được không? | `google_sub IS NOT NULL` |
| Tài khoản này đã liên kết cả hai? | cả hai điều kiện trên |

Không truy vấn nào cần `provider` để chạy nhanh hơn — mọi lối vào đều tra theo một hàng
(`id`/`email`/`google_sub`). Một cột thứ ba chỉ thêm **một nguồn sự thật nữa có thể lệch**: chỉ cần
một lần ghi đặt `google_sub` mà quên đặt `provider`, hàng đó nói dối, và không có gì phát hiện ra.
DRY ở đây không phải sở thích — nó là chống sai dữ liệu.

**Đổi ý thì phải trả gì:** một migration `ADD COLUMN provider` + một câu backfill suy từ hai cột
sẵn có. Rẻ, và lúc đó sẽ có một truy vấn thật đòi nó.

### Ràng buộc thay cho cột

Cái thực sự cần bảo vệ không phải "tài khoản thuộc loại nào" mà **"tài khoản luôn có ít nhất một
lối vào"**. Đó là một `CHECK`, không phải một cột:

```sql
ALTER TABLE users ADD CONSTRAINT chk_users_has_credential
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
```

Không có nó, một lỗi trong đường tạo tài khoản đẻ ra hàng không ai đăng nhập được, và **không có
cách nào xóa hay sửa từ phía sản phẩm**.

---

## 3. `email_verified` là cổng, và nó đứng trước mọi truy vấn

Quyết định của người dùng: email trong ID token trùng một tài khoản mật khẩu sẵn có thì **tự liên
kết**, nhưng **chỉ khi `email_verified === true`**; `false` thì từ chối.

Phần kế hoạch phải nói thêm là **vị trí** của cổng. Nó đứng **trước** bước 2 và bước 3 ở §1, chứ
không chỉ trước bước 2:

- Đặt trước bước 2 thôi: token chưa xác minh vẫn tạo được tài khoản mới mang email của người khác.
  Người thật sau này đăng ký mật khẩu sẽ bị chặn bằng `already_registered` — **từ chối dịch vụ ngay
  trên địa chỉ email của chính họ**.
- Đặt trước cả hai: token chưa xác minh **không chạm vào bảng `users` một lần nào**. Không liên
  kết, không tạo, và cũng không dò được email nào đang tồn tại qua chênh lệch phản hồi.

Kịch bản chiếm tài khoản đầy đủ nằm ở [phase-03 §Bảo mật](phase-03-google-id-token-endpoint.md).

---

## 4. Tài khoản đã xóa mềm: không hồi sinh, không nhân đôi

`deleted_at IS NOT NULL` gặp ở **cả hai** đường tra cứu:

| Trùng theo | Xử lý | Vì sao |
|---|---|---|
| `google_sub` | từ chối `UNAUTHORIZED` | hồi sinh tài khoản đang trong hạn xóa 30 ngày là đi ngược US-05 |
| `email` | từ chối `UNAUTHORIZED` | tạo tài khoản mới cùng email sẽ vỡ `UNIQUE` ngay lập tức |

Đây là cùng một lập trường mà `register()` đã có sẵn: câu kiểm tồn tại của nó **không** lọc
`deleted_at`, nên một email đã xóa mềm coi như đã bị chiếm. Làm Google khác đi mới là chỗ bất nhất.

---

## 5. `GoogleAuthService` tách khỏi `AuthService`

Hai lý do, cả hai đều đo được:

1. `auth.service.ts` đang **161 dòng**. Nhét đường Google (xác minh, ba nhánh tra cứu, xử lý đua
   `23505`) vào đó là vượt mốc 200 dòng của repo.
2. **Sở hữu file.** Phase 02 phải sửa `auth.service.ts` (chốt null + đối xứng thời gian). Phase 03
   mà cũng sửa file đó thì hai phase cùng một chủ.

Hợp đồng giữa hai bên là **một phương thức duy nhất**: phase 02 đổi
`private issueTokenPairWithUser(user)` thành `public`. `GoogleAuthService` tiêm `AuthService` và gọi
nó để phát cặp token. Nhờ vậy **không có đường phát token thứ hai** — xoay vòng refresh, `family_id`,
TTL 60 ngày, thu hồi cả họ đều y hệt phiên mật khẩu, vì đó **đúng là** cùng một đoạn code.

---

## 6. `google-auth-library@^10.9.1`, không phải v11

`npm view` (đã chạy thật): v11 khai `engines.node >= 22`, v10.9.1 khai `>= 18`. Repo khai
`engines.node: >=20.0.0`. Lấy v11 là buộc phải nâng `engines` toàn repo — một thay đổi hạ tầng
không liên quan gì tới đăng nhập Google, kéo theo cả CI (`node-version: '24'` thì qua, nhưng lời
hứa với người dùng repo thì đổi).

`verifyIdToken()` giống nhau giữa hai dòng. Không có gì đánh đổi ở đây ngoài một con số.

**CJS/ESM:** `google-auth-library` là CommonJS, `apps/api` là ESM thuần. Chiều này **không có ma
sát** — ESM `import` được CJS. Chiều gãy (`ERR_REQUIRE_ESM`) là CJS `require()` một gói ESM-only,
không phải trường hợp của ta.

---

## 7. Thiếu cấu hình thì ghi log lúc khởi động, không chặn boot

`GOOGLE_OAUTH_AUDIENCES` rỗng là trạng thái **bình thường hôm nay** — chưa ai có OAuth client ID.

| Cách | Hệ quả |
|---|---|
| Ném lỗi lúc boot (như `JWT_ACCESS_SECRET`) | `make dev` chết ngay với mọi người đang làm việc |
| Boot bình thường, log một dòng WARN, route trả lỗi rõ | phần còn lại của API chạy nguyên |

Chọn cách thứ hai, **đúng tiền lệ `SWAGGER_ENABLED`** đã có: trạng thái bật/tắt trả lời được **từ
log khởi động**, không phải bằng cách đi thử endpoint.

```
[Bootstrap] Google sign-in DISABLED (GOOGLE_OAUTH_AUDIENCES is empty)
```

`POST /auth/google` khi chưa cấu hình trả **500 `INTERNAL_ERROR`** với message tiếng Việt nói rõ là
máy chủ chưa cấu hình. 500 là đúng: đây là lỗi của máy chủ, không phải lỗi của client, và bịa một
mã lỗi mới cho một tình huống cấu hình là thêm nợ cho `ApiErrorCode`.

---

## 8. Hai mã lỗi mới, không nhiều hơn

| Mã | HTTP | Khi nào | Vì sao đáng một mã riêng |
|---|---|---|---|
| `GOOGLE_TOKEN_INVALID` | 401 | chữ ký / `iss` / `aud` / `exp` / thiếu `sub` | client nên bảo người dùng **thử lại** |
| `GOOGLE_EMAIL_UNVERIFIED` | 401 | `email_verified !== true` | thử lại vô ích; phải **đi xác minh email bên Google** |

Gộp hai cái làm một thì app chỉ nói được "đăng nhập Google thất bại" cho cả hai, và người dùng thứ
hai sẽ bấm lại mãi mãi. Tách ra thì mỗi cái có một câu hướng dẫn khác nhau.

Không thêm mã cho "tài khoản đã xóa mềm" — `UNAUTHORIZED` sẵn có đã đúng nghĩa và đúng hành động
(không có gì để làm khác).

> **Dây nối chéo workspace.** `apps/mobile/src/api/error-messages.ts` khai
> `Record<ApiErrorCode, string>` — **đầy đủ mọi khóa**. Thêm mã vào `packages/shared` mà không thêm
> câu tiếng Việt là **lỗi biên dịch mobile**, không phải cảnh báo. Vì thế phase 01 sở hữu cả hai file
> và sửa cùng lúc.

---

## 9. `design.png` không có màn auth — dẫn xuất, không sao chép

Ảnh có **13 màn**, đánh số 1–10 và 12–14. Bảng ánh xạ màn→phase trong
[kế hoạch tổng](../260917-1821-meetio-full-implementation/plan.md) liệt kê đủ 13 màn và **không màn
nào là đăng nhập hay đăng ký**.

Nên hai màn này **thiết kế mới**. Nguồn ngôn ngữ thị giác là ba màn **đã dựng và đã nghiệm thu**:

| Lấy gì | Từ đâu |
|---|---|
| Nền kem + hai mảng peach tràn mép | `ScreenBackdrop` (màn 1–3) |
| Ô icon gradient + wordmark | `AppMark` + `typography.display` (màn 1) |
| Tiêu đề hai dòng | `typography.heading` (màn 2–3) |
| In đậm chữ "Meetio" giữa đoạn | `BrandedParagraph` (màn 2–3) |
| Nút chính cam bo 8 | `PrimaryButton` (cả ba màn) |
| Link chữ cam trên nền sáng | `colors.primaryStrong`, **không** `colors.primary` |

**Quyết định thị giác giao cho `ui-ux-designer`** lúc triển khai, và agent đó bật skill
`tkm:design-ui`. Phase file chỉ chốt *ràng buộc* (token nào, component nào dùng lại, thứ tự nội
dung, trạng thái nào phải vẽ), không chốt số đo.

> **Nợ đã ghi nhận ở kế hoạch trước, kế hoạch này trả.** `app/(auth)/login.tsx` đang dùng
> `colors.primary` cho link chữ trên nền sáng — 2,62:1, đúng thứ quy ước cấm. Phase 06/07 thay bằng
> `primaryStrong`. (`app/(app)/index.tsx` vẫn còn nợ này — ngoài phạm vi.)

---

## 10. Nhánh A thuần trình bày; nối dây ở nhánh C

Yêu cầu là hai nhánh **không chặn nhau**. Chỗ duy nhất chúng có thể đụng nhau là hai file route
`app/(auth)/login.tsx` và `register.tsx`: nhánh A muốn dựng lại giao diện ở đó, nhánh C muốn cắm
`useGoogleSignIn` vào đó. Một file, hai chủ.

Gỡ bằng đúng khuôn repo đang dùng (`app/(app)/permission.tsx` mỏng + `permission-body.tsx` dày):

```
app/(auth)/login.tsx           ← phase 10 (C): hook + điều hướng, ~40 dòng
  └─ <LoginForm ...props />    ← phase 06 (A): thuần trình bày, 0 hook, 0 mạng
       ├─ <AuthScreenShell/>   ← phase 05 (A)
       ├─ <TextField/>         ← đã có
       ├─ <PrimaryButton/>     ← phase 04 (A)
       └─ <GoogleSignInButton onPress loading/> ← phase 05 (A)
```

`LoginForm` **không import** `expo-router`, `@tanstack/react-query`, `zustand`, hay
`@react-native-google-signin/*`. Nó nhận tất cả qua props. Nhờ đó phase 06 chạy được từ đợt 2 mà
chưa cần thư viện native tồn tại, và test của nó không cần mock gì cả.

---

## 11. `PrimaryButton` chuyển gradient — bán kính ảnh hưởng đã đếm

`BrandFill` đã tồn tại, đã có test khóa hướng gradient trong `brand-surfaces.test.tsx`, và
`design.png` vẽ **mọi** nút chính là gradient chéo. `PrimaryButton` thì đang `backgroundColor:
colors.primary` phẳng.

Đổi nó chạm **5 màn đã nghiệm thu**, đếm bằng `grep`:

| File | Màn |
|---|---|
| `app/onboarding.tsx` | 2 |
| `src/components/permission/permission-body.tsx` | 3 |
| `app/(app)/index.tsx` | 4 |
| `app/(app)/consent.tsx` | đồng ý ghi âm |
| `app/(app)/settings.tsx` | 14 |

Đây là **lý do để làm**, không phải lý do để tránh: năm màn kia đang lệch design theo đúng cách đó.

**Cái giá:** một vòng QA thị giác lại năm màn (gộp vào phase 11), và `LinearGradient` thay `View`
làm gốc của nút — `Pressable` vẫn bọc ngoài nên `accessibilityRole`, `disabled`, `onPress` không
đổi. Điều kiện cứng: **toàn bộ test mobile hiện có phải xanh nguyên, không sửa một test nào**. Sửa
được một test cũ nghĩa là hành vi đã đổi, và đó không phải việc của phase này.

Khuôn khẳng định gradient đã có sẵn ở `brand-surfaces.test.tsx` — dùng lại y nguyên, không nghĩ kiểu
mới.

---

## 12. Chiến lược mock Jest phải xác lập bằng **thực nghiệm**, không bằng tài liệu

Báo cáo nghiên cứu nói thư viện có mock Jest chính thức, cắm bằng
`setupFiles: ["./node_modules/.../jest/build/jest/setup.js"]`. Hai sự thật đã kiểm trực tiếp:

| Kiểm cái gì | Kết quả |
|---|---|
| `npm view @react-native-google-signin/google-signin@16.1.5 exports` | **chỉ có** `.`, `./app.plugin.js`, `./package.json` |
| `tar -tzf` gói đã publish | `package/jest/build/jest/setup.js` **có thật trong tarball** |

Nghĩa là: file có, nhưng **`./jest/*` không nằm trong `exports`**. Gọi bằng specifier trần
(`@react-native-google-signin/google-signin/jest/...`) sẽ đâm vào cổng `exports`
(`ERR_PACKAGE_PATH_NOT_EXPORTED`). Gọi bằng **đường dẫn file tường minh**
(`<rootDir>/../../node_modules/...`) thì đi vòng qua cổng đó — nhưng **đây là suy luận, chưa chạy**.

Có tiền lệ đắt trong chính repo này: kế hoạch trước **giả định** `jest-expo` tự mock `ExpoAudio`, nó
không mock, và `expo-audio` nổ ngay lúc import trước khi thân test kịp chạy. Mất một vòng làm lại.
Cùng hình dạng thất bại, cùng bán kính.

**Nên phase 08 mở đầu bằng một bước đo, không bằng một dòng config.** Ba đường, thử theo thứ tự,
dừng ở cái đầu tiên chạy:

1. `setupFiles` trỏ **đường dẫn file tường minh** tới setup của thư viện;
2. `jest.mock('@react-native-google-signin/google-signin', ...)` **tại chỗ trong file test**;
3. mock trong `apps/mobile/jest.setup.ts` — nơi repo **đã** tự tay dựng in-memory mock cho
   `expo-secure-store` vì đúng lý do này.

Tiêu chí nghiệm thu là cái quan sát được: **`yarn workspace @meetio/mobile run test` thoát 0 và
đường Google có test phủ** — không phải "đã cắm mock chính thức".

> Lưu ý hoist: yarn 4 ở chế độ `node-modules`, gói có thể nằm ở `node_modules/` **gốc repo** chứ
> không phải `apps/mobile/node_modules/`. Đường dẫn tường minh phải tìm ra vị trí thật, đừng đoán.

---

## 13. `expo prebuild` **mặc định là clean** — tiền đề ngược lại là sai

Đã đọc thẳng CLI đang cài, `node_modules/@expo/cli/build/src/prebuild/index.js:112`:

```js
clean: !args['--no-clean'],
```

Nên `expo prebuild` trần — đúng lệnh `make build-app` chạy ở Makefile:196 — **xóa và dựng lại
`ios/` + `android/` mỗi lần**. README (mục "Native builds") đã nói đúng điều này.

Hệ quả: lớp lỗi "`iosUrlScheme` không sống sót qua prebuild sạch" (issue #1313 / #1280 / expo#36412)
**có áp dụng ở đây**, không phải không. Nó không đổi kế hoạch — vẫn `grep` Info.plist như dự định —
nhưng nó đổi **mức độ**: bước kiểm đó không phải cho đủ lệ, nó là thứ duy nhất đứng giữa một lần
prebuild im lặng làm rơi URL scheme và một cú `NSInvalidArgumentException` trên máy thật.

`make app-verify` hôm nay kiểm `android/gradlew` và `ios/*.xcworkspace`. Thêm một kiểm thứ ba, **bỏ
qua sạch khi chưa cấu hình** để không làm gãy `make build-app` của mọi người ngay hôm nay:

| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Info.plist có reversed client ID | Kết quả |
|---|---|---|
| rỗng / chưa đặt | — | `– ios google — bỏ qua (chưa cấu hình)` |
| đã đặt | có | `✅ ios google — URL scheme đã vào Info.plist` |
| đã đặt | không | `❌` + `exit 1` |

---

## 14. `app.json` → `app.config.ts`, để plugin đọc được env

Plugin của thư viện đòi `iosUrlScheme` — một hằng **lúc dựng native**, đóng đinh vào Info.plist, đọc
lúc chạy không kịp. `app.json` là JSON tĩnh, không đọc được `process.env`.

| Cách | Vấn đề |
|---|---|
| Đóng cứng reversed client ID vào `app.json` | hôm nay chưa có ID nào; ghi placeholder là nướng một URL scheme sai vào Info.plist |
| Bỏ hẳn entry plugin, bảo người dùng tự thêm tay | iOS nổ `NSInvalidArgumentException` cho tới khi họ thêm, và không có gì nhắc |
| **`app.config.ts`, thêm entry plugin có điều kiện** | phải chuyển đổi file cấu hình |

Chọn cách thứ ba. Entry plugin **chỉ xuất hiện khi env có giá trị**, nên hôm nay bản dựng native y
hệt hiện tại; điền `.env` xong thì `make build-app` tự nhét scheme vào và `app-verify` chứng minh nó
đã vào.

**Cái giá là rủi ro chuyển đổi**, và nó có cách đo: chạy `npx expo config --type public --json`
**trước và sau**, với env Google để rỗng, rồi diff. **Diff rỗng là tiêu chí nghiệm thu** của bước
chuyển đổi.

> Client ID của Google là **định danh công khai**, không phải bí mật — để trong `.env.example` và
> trong native đã sinh đều đúng. Cái bí mật (client *secret*) không xuất hiện ở đâu trong luồng này:
> ta chỉ **xác minh** ID token, không đổi mã lấy token.

---

## 15. Người chỉ-Google và `DELETE /users/me` — nợ do chính kế hoạch này tạo ra

`users.service.ts:65` làm `argon2.verify(user.password_hash, password)`. Khi `password_hash` thành
nullable, **người đăng nhập bằng Google không còn xóa được tài khoản của mình** — API luôn trả "Mật
khẩu không đúng". Đó là đi ngược US-05, và nó là **regression do kế hoạch này gây ra**, không phải
một tính năng đem hoãn.

Chia hai mức:

| Phase | Làm gì | Vì sao ở đó |
|---|---|---|
| **02** (bắt buộc) | `password_hash` null ⇒ ném `VALIDATION_ERROR` **nói rõ đây là tài khoản Google**, thay vì "sai mật khẩu" | typecheck ép phải sờ vào file này; nói thật rẻ hơn nói dối |
| **12** (P3, cắt được) | `DELETE /users/me` nhận **`google_id_token`** thay cho `password`, xác minh bằng đúng `GoogleTokenVerifier` của phase 03 và đòi `sub` khớp `users.google_sub` | dùng lại nguyên bộ xác minh; ~20 dòng logic mới |

**Cắt phase 12 thì cái gì hỏng:** người chỉ-Google không xóa được tài khoản cho tới khi có phase
khác lo. Họ **được báo rõ lý do** (nhờ phase 02), nhưng vẫn không có lối đi. Đây là một quyết định
sản phẩm, không phải kỹ thuật — nên nó là một phase riêng, để cắt được.

**Vì sao lộ "đây là tài khoản Google" ở chỗ này thì an toàn, còn ở màn login thì không:**
`DELETE /users/me` nằm sau `JwtAuthGuard`, người gọi **chính là chủ tài khoản đã xác thực** — họ đã
biết họ đăng nhập bằng gì. `POST /auth/login` thì người gọi ẩn danh, và bất kỳ chênh lệch nào cũng
là một oracle liệt kê tài khoản. Xem §16.

---

## 16. Đối xứng thời gian ở `login()` — lỗi thật, nhưng không phải lỗi 500

Tiền đề trong brief là: `password_hash` null làm `argon2.verify(null, …)` ném ra và trả **500**.
**Đã đo, không đúng:**

```
argon2.verify(null, 'x')  →  Promise bị reject: TypeError "pchstr must be a non-empty string"
```

Nó **reject**, không throw đồng bộ. Mà dòng 68 đã có `.catch(() => false)` sẵn — nên thực tế đường
đi là `passwordOk = false` ⇒ `UnauthorizedException` sạch sẽ. Không có 500 nào cả.

**Lỗi thật là chỗ khác, và tinh vi hơn:**

| Tình huống | Chi phí argon2 phải trả |
|---|---|
| Email không tồn tại | `verify(timingSafetyHash, …)` — **đầy đủ** (code đã có sẵn) |
| Sai mật khẩu | `verify(hash thật, …)` — **đầy đủ** |
| **Tài khoản chỉ-Google** | **0** — reject ngay lập tức |

Chênh lệch giữa 0 và một vòng argon2id là **hai bậc độ lớn**, đo được từ ngoài bằng đồng hồ bấm
tay. Nó trả lời đúng câu hỏi mà toàn bộ cơ chế `timingSafetyHash` được dựng lên để **không** trả
lời: *"email này có tài khoản không, và loại gì?"*

Cách sửa: khi `password_hash` là null thì **đốt đúng chi phí đó** bằng chính `timingSafetyHash` đã
có, rồi trả `false`. Không cơ chế mới, không hằng số mới — dùng lại thứ đang chạy.

Tiêu chí nghiệm thu quan sát được, có hai vế (chi tiết ở [phase-02](phase-02-nullable-password-and-google-sub.md)):
1. mã lỗi + message của ba tình huống trên **giống nhau từng ký tự**;
2. thời gian của tình huống chỉ-Google **> 50%** thời gian của tình huống sai-mật-khẩu. Ngưỡng 50%
   không mong manh: khoảng cách thật là ~100ms so với <1ms.

---

## 17. `EXPO_PUBLIC_*` chưa từng tới được bundle — lỗi có sẵn, đã đo

Ban đầu mục này là một **rủi ro cần khảo sát**. Đã đo xong; nó là **lỗi đã xác nhận**, và bản sửa
được nâng thành [phase 00](phase-00-expo-public-env-reaches-the-bundle.md).

### Bằng chứng

**1 — `@expo/env` không đi ngược lên gốc repo.** Gọi thẳng, với đúng project root Expo dùng:

```
require('@expo/env').load('/…/meetio/apps/mobile')
→ process.env.EXPO_PUBLIC_API_URL vẫn undefined
→ getFiles() = ['.env.development.local', '.env.local', '.env.development', '.env']
```

Bốn tên đó phân giải **tương đối với project root được truyền vào** — `apps/mobile/`, nơi không có
file nào trong số đó. `.env` chỉ tồn tại ở gốc repo.

**2 — cơ chế nội tuyến chạy tốt, nó chỉ không có gì để nội tuyến.** Cùng một phép biến đổi
`babel-preset-expo`, `NODE_ENV=production`:

| Môi trường | Kết quả |
|---|---|
| shell sạch (clone mới + `make env`) | `var u=undefined;` |
| cùng thế, biến được export trong shell | `var u="http://sentinel-xyz789.invalid";` |

Nên `apiClient.baseURL` và `rawClient.baseURL` (`axios-client.ts:14,24`) là `undefined` trong **mọi**
bản dựng làm theo đúng tài liệu.

### `grep` bundle KHÔNG phải bằng chứng — theo chiều nào cũng vậy

Một lần trong quá trình điều tra, chuỗi `http://localhost:3000` được tìm thấy trong bundle production
đã export và bị đọc là "biến đã tới nơi". **Dương tính giả.** Chuỗi đó cũng nằm trong
`node_modules/expo-router/build/head/url.js:64` như giá trị mặc định của thư viện, và Hermes gộp các
chuỗi giống hệt nhau — nên một lần khớp không phân biệt được hai nguồn. Ghi lại đây để không ai
dựng lại phép "kiểm chứng" đó.

### Vì sao là phase 00, không phải một mục bên trong phase 08

Lỗi này **có sẵn** và **toàn app** — nó làm hỏng `EXPO_PUBLIC_API_URL` trước khi có bất kỳ dòng code
Google nào. Nhét nó vào phase 08 sẽ nói dối hai lần: rằng nó do đăng nhập Google gây ra, và rằng
cắt Google là hết lỗi. Đánh số **00** vì nó đứng **trước** phần việc mới; đây cũng là khuôn kế hoạch
tổng đã dùng ("Phase 00 là cổng chặn cứng").

### Ba cách, chọn (a)

| Cách | Phán quyết |
|---|---|
| **(a) `make env` ghi thêm `apps/mobile/.env`, CHỈ gồm khoá `EXPO_PUBLIC_*`** | **CHỌN** |
| (b) symlink `apps/mobile/.env` → `../../.env` | **Loại — lý do bảo mật** |
| (c) Makefile export biến trước khi gọi expo | **Loại — chỉ đúng một cửa vào** |

**(b)** đặt `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GEMINI_API_KEY` **bên trong
project root của Expo**, và `@expo/env.load()` đọc hết vào môi trường tiến trình Metro. Chúng không
bị nội tuyến (chỉ `EXPO_PUBLIC_*` mới bị), nên chưa phải rò rỉ ngay — nhưng nó đặt toàn bộ bí mật
máy chủ **cách một lỗi gõ tiền tố** khỏi bundle client. Sự an toàn không được phép phụ thuộc vào
việc không ai gõ nhầm.

**(c)** chỉ chạy khi đi qua `make mobile`. README **đang** hướng dẫn một đường không dùng make
(`yarn workspace @meetio/mobile run start`); EAS Build và cấu hình chạy trong IDE cũng đi vòng qua
Makefile. Một bản vá chỉ đúng với một cửa vào là cái bẫy tệ nhất trong ba: nó chạy cho người vừa
dựng nó và hỏng im lặng với mọi người khác.

**(a)** là **danh sách cho phép, không phải kỷ luật**: file mobile sinh từ một danh sách khoá cố
định, nên "không có bí mật trong file env của mobile" là tính chất **cấu trúc**. Nó đúng với mọi
cửa vào, vì `@expo/env` đọc project root bất kể ai khởi động bundler. Cái giá là hai file env; giảm
nhẹ bằng cách buộc `make env` là **nơi ghi duy nhất** và tuyên bố file mobile là đầu ra dẫn xuất.

`.gitignore` **không phải sửa** — đã kiểm, không tin lời ai:

```
git check-ignore -v apps/mobile/.env  →  .gitignore:12:.env	apps/mobile/.env
```

Mẫu `.env` ở dòng 12 không có `/` đứng đầu nên khớp ở mọi độ sâu.

### Phép kiểm phải tự bảo vệ khỏi hai kiểu đậu oan

Phép kiểm ngây thơ ("biến đổi rồi tìm chữ `undefined`") **đậu sai** dưới `NODE_ENV=development`: ở
chế độ đó `babel-preset-expo` không nội tuyến mà sinh
`require("expo/virtual/env").env.EXPO_PUBLIC_API_URL` — một tra cứu lúc chạy, trong đó không có chữ
`undefined` nào. Và nó cũng đậu sai khi người chạy tình cờ đã export biến trong shell.

Nên `apps/mobile/scripts/check-public-env.cjs` phải **tự** làm hai việc, không trông vào người gọi:

1. đặt `process.env.NODE_ENV = 'production'` ở dòng đầu;
2. `delete` các khoá cần kiểm khỏi `process.env` **trước** khi gọi `load()`, để chỉ file mới cung
   cấp được giá trị;

rồi khẳng định đầu ra chứa **đúng giá trị đọc từ file**, không chỉ "khác `undefined`". Bản đã làm
cứng được kiểm trên bốn tình huống (hiện trạng · biến export trong shell · có file trong shell dev ·
file thiếu một khoá) và cho đúng kết quả ở cả bốn — bảng đầy đủ ở
[phase 00](phase-00-expo-public-env-reaches-the-bundle.md).
