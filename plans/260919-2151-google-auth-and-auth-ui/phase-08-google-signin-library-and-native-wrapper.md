---
phase: 08
title: "Thư viện google-signin + bọc native + chiến lược mock Jest"
status: completed
priority: P1
effort: 2.5h
blockedBy: []
blocks: [09, 11]
---

# Phase 08 — Thư viện google-signin + bọc native + mock Jest

**Liên kết:** [plan.md](plan.md) · [decisions §12 (mock Jest phải đo, không giả định)](decisions.md) ·
[decisions §13 (`prebuild` mặc định clean)](decisions.md) ·
[decisions §14 (`app.json` → `app.config.ts`)](decisions.md) · [decisions §17 (đường env)](decisions.md) ·
[phase-00 (đường env)](phase-00-expo-public-env-reaches-the-bundle.md) · [file-ownership.md](file-ownership.md) ·
[Báo cáo stack](../reports/researcher-2026-09-19-google-signin-stack.md)

> **Phase này mở đầu bằng MỘT bước ĐO, không bằng code** — chiến lược mock Jest. Nó có tiền lệ thất
> bại trong chính repo này. Chưa đo xong thì chưa được viết dòng nào phụ thuộc vào kết quả.

## Tổng quan

Đưa `@react-native-google-signin/google-signin` vào app, cho nó đọc client ID từ env, và bọc nó
sau **một** hàm để phần còn lại của app không bao giờ phải biết hình dạng API của nó.

## Đường env: đã xong ở phase 00, không đo lại ở đây

`EXPO_PUBLIC_*` **chưa từng tới được bundle** — đã đo và xác nhận, không còn là nghi vấn:
`@expo/env.load('apps/mobile')` để `EXPO_PUBLIC_API_URL` ở `undefined` (nó không đi ngược lên gốc
repo), và `babel-preset-expo` nội tuyến `var u=undefined;` trong một shell sạch. Bằng chứng đầy đủ
và bản sửa nằm ở **[phase 00](phase-00-expo-public-env-reaches-the-bundle.md)**.

Hệ quả cho phase này:

- **Không lặp lại bước đo.** Phase 00 sở hữu cả chẩn đoán lẫn bản sửa.
- `app.config.ts` ở đây đọc `process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`, và Expo CLI chạy
  `@expo/env` trên project root trước khi đánh giá config — nên **đường kích hoạt thật là
  `apps/mobile/.env` do phase 00 sinh ra**.
- Hai phase chạy song song được (test ở đây tự đặt biến). Cho tới khi phase 00 xong, **AC #3 phải
  export biến trong shell** thay vì trông vào file env. Ghi rõ như vậy ở bảng nghiệm thu.

## Bước đo — module này hành xử thế nào dưới Jest?

Đã kiểm **trực tiếp** hai điều, và chúng mâu thuẫn nhau:

| Kiểm | Kết quả |
|---|---|
| `npm view @react-native-google-signin/google-signin@16.1.5 exports` | **chỉ** `.`, `./app.plugin.js`, `./package.json` |
| `tar -tzf` gói đã publish | `package/jest/build/jest/setup.js` **có trong tarball** |

Tức là file mock **có tồn tại** nhưng `./jest/*` **không được `exports` công bố**. Gọi bằng
specifier trần sẽ đâm `ERR_PACKAGE_PATH_NOT_EXPORTED`; gọi bằng đường dẫn file tường minh thì đi
vòng qua cổng đó — **nhưng đó là suy luận, chưa chạy**.

Tiền lệ đắt: kế hoạch trước **giả định** `jest-expo` tự mock `ExpoAudio`, nó không mock, module nổ
ngay lúc import trước khi thân test kịp chạy, mất một vòng làm lại. Cùng hình dạng thất bại.

**Đo thế nào:** viết một file test một dòng chỉ `import` module rồi `expect(true).toBe(true)`, chạy
`yarn workspace @meetio/mobile run test`, và thử ba đường **theo thứ tự**, dừng ở cái đầu tiên xanh:

1. `setupFiles` trỏ **đường dẫn file tường minh** tới setup của thư viện
   (nhớ: yarn 4 `node-modules` hoist — gói có thể nằm ở `node_modules/` **gốc repo**, đừng đoán
   đường dẫn, `find` nó);
2. `jest.mock('@react-native-google-signin/google-signin', () => …)` **ngay trong file test**;
3. mock trong `apps/mobile/jest.setup.ts` — nơi repo **đã** tự dựng in-memory mock cho
   `expo-secure-store` vì đúng lý do này.

**Ghi kết quả vào [decisions §12](decisions.md) rồi mới đi tiếp.**

## Nhận định then chốt

- **API v16.1.5 lồng trong `data`.** `signIn()` trả `{ type: 'success', data: { idToken, user, … } }`,
  **không** phải hình dạng phẳng `userInfo.user.email` trong hầu hết bài hướng dẫn trên mạng. Đọc
  sai hình dạng cho ra `undefined` **chứ không ném lỗi** — hỏng im lặng. Dùng type guard chính chủ
  `isSuccessResponse()`, đừng tự so `response.type`.
- **Chỉ cần `webClientId`.** `idToken` có được là nhờ `webClientId`, trên **cả** iOS lẫn Android.
  **Không** bật `offlineAccess` — ta chỉ xác thực, không gọi API thay người dùng; bật lên là thêm
  một màn xin quyền vô ích.
- **Không chạy được trong Expo Go.** Cần development build. Điều này đã đúng với `expo-audio` nên
  quy trình `make build-app` sẵn có là đủ.
- **`app.json` → `app.config.ts`** để entry plugin chỉ xuất hiện khi env có giá trị (decisions §14).

## Yêu cầu

**Chức năng**

1. `yarn workspace @meetio/mobile add @react-native-google-signin/google-signin@^16.1.5`.
2. **Xóa** `apps/mobile/app.json`, **tạo** `apps/mobile/app.config.ts` giữ nguyên toàn bộ cấu hình
   cũ, cộng thêm plugin **có điều kiện**:
   ```
   plugins = ['expo-router', ['expo-audio', {...}]]
   if (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME) {
     plugins.push(['@react-native-google-signin/google-signin',
                   { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME }])
   }
   ```
   Không để cả `app.json` lẫn `app.config.ts` cùng tồn tại — Expo sẽ merge và gây nhầm lẫn.
3. `src/auth/google-native-signin.ts`:
   ```ts
   export type GoogleNativeResult =
     | { status: 'success'; idToken: string }
     | { status: 'cancelled' }
     | { status: 'unavailable' }      // thiếu Play Services
     | { status: 'error'; code?: string };

   /** Gọi configure() một lần (idempotent), hasPlayServices(), signIn(). */
   export async function signInWithGoogleNative(): Promise<GoogleNativeResult>;
   ```
   - `configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID })`,
     gọi một lần nhờ cờ module-level;
   - thiếu `webClientId` ⇒ trả `{ status: 'error', code: 'NOT_CONFIGURED' }`, **không ném** — app
     không được crash vì một biến env trống;
   - `isSuccessResponse(res)` mà `data.idToken` rỗng ⇒ `{ status: 'error', code: 'NO_ID_TOKEN' }`;
   - `isErrorWithCode(err)` ⇒ ánh xạ `SIGN_IN_CANCELLED`→`cancelled`,
     `PLAY_SERVICES_NOT_AVAILABLE`→`unavailable`, còn lại →`error` kèm `code`.
4. `.env.example` thêm bốn khóa (**ghi cả cụm server lẫn cụm mobile trong phase này**, một chủ sở hữu):
   ```
   # --- Google Sign-In (client ID là định danh CÔNG KHAI, không phải bí mật) ---
   GOOGLE_OAUTH_AUDIENCES=
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
   EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=
   ```

**Phi chức năng**

- File < 200 dòng (dự kiến ~90).
- **Không** chạy `make build-app` trong phase này — dựng native thuộc phase 11.
- Không màn hình nào import trực tiếp `@react-native-google-signin/*`; chỉ file bọc này được phép.

## Luồng dữ liệu

```
màn hình → useGoogleSignIn (09) → signInWithGoogleNative (08) → GoogleSignin.signIn()
                                        │                               │
                                        └── GoogleNativeResult ◄────────┘
```

Phần còn lại của app chỉ thấy `GoogleNativeResult` — một union bốn nhánh, không có `null`, không có
ngoại lệ ném ra. Đó là toàn bộ điểm của lớp bọc: **hình dạng API của thư viện dừng lại ở đây**, nên
một lần nâng major về sau chỉ sửa một file.

## File liên quan

Tạo: `apps/mobile/app.config.ts` · `apps/mobile/src/auth/google-native-signin.ts` + `.test.ts`
Sửa: `apps/mobile/package.json` · `yarn.lock` · `.env.example` · `apps/mobile/jest.setup.ts` (nếu
bước đo 2 kết luận là cần)
Xóa: `apps/mobile/app.json`

## Các bước triển khai

1. Cài thư viện.
2. **Bước đo** (Jest) → ghi kết quả vào decisions §12, chốt một trong ba đường.
3. `npx expo config --type public --json > /tmp/before.json` (**trước khi** đổi cấu hình).
4. Chuyển `app.json` → `app.config.ts`; với env Google để rỗng, chạy lại và `diff` — **phải rỗng**.
5. Viết `google-native-signin.ts` + test đủ năm nhánh.
6. `yarn workspace @meetio/mobile run test`.

## Todo

- [ ] Bước đo: đường mock Jest nào chạy? Ghi kết quả vào decisions §12
- [ ] Cài `@react-native-google-signin/google-signin@^16.1.5`
- [ ] Chụp `expo config` trước khi đổi
- [ ] `app.config.ts` + xóa `app.json` + diff rỗng
- [ ] `signInWithGoogleNative` + test 5 nhánh
- [ ] `.env.example` 4 khóa

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn workspace @meetio/mobile run test` | **thoát 0**, và đường Google có test phủ. *Đây là tiêu chí của bước đo — không phải "đã cắm mock chính thức"* |
| 2 | `diff <(git show HEAD:...expo-config-before.json) <(npx expo config --type public --json)` với env Google rỗng | **rỗng** |
| 3 | với `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` có giá trị: `npx expo config --type public --json \| grep -c google-signin` | `>= 1`. Trước khi phase 00 xong thì **export biến trong shell**; sau đó nó đến từ `apps/mobile/.env` |
| 4 | `ls apps/mobile/app.json` | **không tồn tại** |
| 5 | `signInWithGoogleNative trả cancelled khi người dùng đóng hộp thoại` | pass |
| 6 | `... trả unavailable khi PLAY_SERVICES_NOT_AVAILABLE` | pass |
| 7 | `... trả error/NOT_CONFIGURED khi thiếu webClientId, và KHÔNG ném` | pass |
| 8 | `... trả error/NO_ID_TOKEN khi success nhưng idToken rỗng` | pass |
| 9 | `... đọc idToken từ response.data.idToken (hình dạng v16), không từ response.idToken` | pass — ca này khóa đúng lỗi "làm theo tutorial cũ" |
| 10 | `grep -rln "@react-native-google-signin" apps/mobile/src apps/mobile/app` | **đúng một file**: `src/auth/google-native-signin.ts` |
| 11 | `yarn typecheck && yarn lint` | thoát 0 |
| 12 | `wc -l apps/mobile/src/auth/google-native-signin.ts` | `< 200` |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Mock Jest không cắm được bằng specifier trần (`exports` chặn) | **Cao** × Trung | Bước đo có ba đường; AC #1 đo kết quả, không đo phương pháp |
| `EXPO_PUBLIC_*` chưa từng tới bundle ⇒ `webClientId: undefined` hỏng im lặng | **Đã xác nhận** × Cao | Sửa ở [phase 00](phase-00-expo-public-env-reaches-the-bundle.md). Ở đây: AC #7 biến trường hợp đó thành lỗi **có tên** (`NOT_CONFIGURED`) chứ không phải một token rỗng |
| Chuyển `app.json` → `app.config.ts` làm rơi một trường (`bundleIdentifier`, `adaptiveIcon`, `scheme`…) | Trung × Cao | AC #2: diff **rỗng**. Đây là bước có thể chứng minh, không phải bước phải tin |
| Viết code theo hình dạng API cũ (`userInfo.*` phẳng) | Cao × Trung | AC #9 khóa đúng đường `data.idToken` |
| Expo 57 dựng Android không đạt `compileSdk >= 35` / `kotlin >= 2.0.21` | Trung × Cao | **Chưa xác nhận được** — `make build-app` ở phase 11 sẽ chứng minh hoặc bác bỏ. Ghi ở [mục còn mở](plan.md) |
| Một màn import thẳng thư viện, bỏ qua lớp bọc | Trung × Trung | AC #10 là một lệnh `grep` |

## Bảo mật

- **Client ID của Google là định danh công khai**, không phải bí mật. Nằm trong `.env.example`, nằm
  trong bundle mobile, nằm trong Info.plist — đều đúng. Cái bí mật (client *secret*) **không xuất
  hiện ở đâu** trong luồng này: máy chủ chỉ **xác minh** token đã ký, không đổi mã lấy token.
- **Không** bật `offlineAccess`/`serverAuthCode`: nó xin quyền truy cập ngoại tuyến vào tài khoản
  Google mà sản phẩm không dùng tới. Xin quyền thừa là cả rủi ro lẫn ma sát UX.
- **Không log `idToken`.** Lớp bọc trả nó lên trên và không được `console.log` ở bất kỳ nhánh nào,
  kể cả nhánh lỗi. Nó là bearer credential sống ~1 giờ.
- `iosClientId` truyền vào `configure()` chỉ phục vụ luồng native trên iOS; **`aud` của ID token vẫn
  là `webClientId`**. Máy chủ chấp nhận `aud` theo danh sách nên nếu giả định này sai (báo cáo đánh
  dấu Medium confidence) thì sửa **biến môi trường**, không sửa code.

## Đường lùi

`git revert` + `yarn install` khôi phục `app.json`. Vì entry plugin **có điều kiện**, một cây mã đã
cài thư viện nhưng env rỗng dựng ra native **y hệt hôm nay** — nên rủi ro thật sự nằm ở phase 11
(lúc dựng native), không nằm ở đây.

## Tiếp theo

Mở khóa **09** (hook) và **11** (dựng native + xác minh).
