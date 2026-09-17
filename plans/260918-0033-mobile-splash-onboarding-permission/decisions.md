# Quyết định thiết kế — màn 1–3

Mỗi mục ghi: **chọn gì · vì sao · cái giá đã chấp nhận**. Đây là nơi duy nhất giữ lý do; phase file
chỉ trỏ về đây.

---

## 1. Splash là component, không phải route

`app/_layout.tsx` hiện **đã** giữ app lại bằng `<LoadingState />` khi `authStatus === 'hydrating'`.
Màn Splash thay vào đúng chỗ đó.

Hệ quả: không có route `/splash`, không có bước điều hướng nào phải "thoát khỏi" splash, và —
quan trọng nhất — **không route con nào mount trước khi state xong**, nên `(app)/_layout.tsx`
không thể kịp bắn `<Redirect href="/(auth)/login" />` rồi bị kéo ngược lại. Đây là toàn bộ câu trả
lời cho "làm sao không nháy sai màn": không phải ẩn đi cho nhanh, mà là **không cho nó mount**.

Cổng mở khi cả ba điều kiện cùng xong:

| Điều kiện | Nguồn | Phase |
|---|---|---|
| `session.authStatus !== 'hydrating'` | `useHydrateSession()` (đã có) | — |
| `preferences.status === 'ready'` | `useHydratePreferences()` (mới) | 02 |
| đã trôi tối thiểu 900 ms | `useMinimumSplashDelay(900)` (mới) | 04 |

Ba điều kiện chạy **song song**, tổng thời gian là `max(...)` chứ không phải tổng. 900 ms để splash
là một khoảnh khắc có chủ ý thay vì một cú nháy 40 ms; hydrate lâu hơn thì nó không cộng thêm gì.

Native splash (ảnh Expo dựng lúc app khởi động, trước cả JS) **ngoài phạm vi** — xem §5.

---

## 2. Một bộ quyết định định tuyến duy nhất

`src/navigation/bootstrap-route.ts`:

```
resolveBootstrapRoute({ authStatus, onboardingCompleted, micPromptSeen })
  !onboardingCompleted            → '/onboarding'
  authStatus !== 'authenticated'  → '/(auth)/login'
  !micPromptSeen                  → '/(app)/permission'
  ngược lại                       → '/(app)'
```

`app/index.tsx` là nơi **duy nhất** gọi hàm này.

**Bất biến: mọi màn khi "xong" đều `router.replace('/')`**, không bao giờ nhảy thẳng tới màn kế.
Gồm cả `(auth)/_layout.tsx` — hiện đang redirect về `APP_HOME_ROUTE` (`/(app)`). **Phải đổi về
`'/'`**, nếu không người vừa đăng nhập xong sẽ nhảy qua màn quyền micro: `authStatus` lật sang
`authenticated`, guard của `(auth)` bắn ngay về `/(app)`, và `app/index.tsx` không bao giờ được
chạy lại. Đây là lỗi thật sẽ xảy ra nếu không sửa, không phải dọn dẹp cho đẹp.

Vì sao đáng làm như vậy: thêm một cổng sau này (ví dụ quyền thông báo) là sửa **một hàm thuần có
test**, không phải đi truy mọi lời gọi `router.replace` rải khắp app.

**Vị trí trong cây route:**

| Màn | Đường dẫn | Vì sao ở đó |
|---|---|---|
| Onboarding | `app/onboarding.tsx` (gốc) | Chạy trước khi biết có session hay không ⇒ không thuộc guard nào |
| Quyền micro | `app/(app)/permission.tsx` | Chỉ tới sau khi đã đăng nhập ⇒ guard sẵn có của `(app)` đúng là thứ nó cần |

Onboarding **không** bọc thêm group layout riêng: một màn không đáng một layout (YAGNI). Nó chỉ tới
được bằng redirect từ `/`, và khi xong thì `replace('/')` nên back-gesture không quay lại được.

**Kiểm tra vòng lặp redirect** (phải giữ đúng, có test ở phase 05):

- `index → /(auth)/login` khi chưa auth; guard `(auth)` chỉ đá đi khi `authenticated` ⇒ không lặp.
- `index → /(app)/permission` khi đã auth; guard `(app)` chỉ đá đi khi **chưa** auth ⇒ không lặp.
- `onboarding → '/' → /(auth)/login`: một vòng, vì cờ đã được đặt trong store **trước** khi điều
  hướng (§3).

---

## 3. Lưu cờ bằng `expo-secure-store`, không thêm AsyncStorage

Hai boolean, cục bộ theo máy, không nhạy cảm: `meetio.onboarding_completed`, `meetio.mic_prompt_seen`.

| | `expo-secure-store` | `@react-native-async-storage/async-storage` |
|---|---|---|
| Đã là dependency | ✅ (`~57.0.4`) | ❌ thêm native module + một vòng prebuild |
| Đã có mock trong `jest.setup.ts` | ✅ | ❌ phải viết thêm |
| Đủ sức cho 2 khóa | thừa | thừa |
| Xoá khi gỡ app — Android | ✅ | ✅ |
| Xoá khi gỡ app — iOS | ❌ Keychain sống sót | ✅ |

**Chọn `expo-secure-store`.** Hai boolean không đủ lý do để kéo thêm một native dependency và một
vòng prebuild nữa (YAGNI). Phần thưởng kèm theo: mock secure-store trong `jest.setup.ts` đã có sẵn,
nên phase 02 không phải đụng vào file setup dùng chung.

### Hệ quả khi cài lại app

- **Android** — dữ liệu app bị xoá, cờ mất, onboarding hiện lại. Đúng trực giác.
- **iOS** — Keychain sống sót qua lần gỡ, cờ còn nguyên, onboarding **không** hiện lại.

Hai nền tảng lệch nhau. Chấp nhận, vì:

1. App **đã** hành xử đúng như thế với access/refresh token trong `src/storage/secure-store.ts` —
   người cài lại app trên iOS hiện đã thấy mình còn đăng nhập. Làm cờ onboarding khác đi mới là chỗ
   bất nhất.
2. Người từng xem onboarding mà không phải xem lại là kết quả chấp nhận được, không phải lỗi.

Nếu về sau **cần** reset theo từng lần cài, cách làm là một khóa "install id" ghi ở nơi bị xoá cùng
app (AsyncStorage / `expo-file-system`) rồi so sánh — **cố ý không dựng bây giờ**.

> Hành vi Keychain-sống-sót-qua-gỡ-app là mặc định của iOS (thay đổi ở beta iOS 10.3 đã bị thu hồi).
> Vẫn phải **kiểm bằng tay** trên đúng phiên bản iOS đang nhắm — mục QA ở phase 08 — thay vì tin tài liệu.

### Thứ tự ghi — bắt buộc

**Không bao giờ chặn người dùng vì một lần ghi hỏng.** Thứ tự:

1. đặt state trong Zustand store (đồng bộ, không thể hỏng);
2. rồi mới gọi ghi xuống secure-store, **nuốt lỗi**;
3. rồi `router.replace('/')`.

Ghi hỏng thì lần mở sau onboarding hiện lại một lần — phiền, không kẹt. Ngược lại (đợi ghi xong mới
đi tiếp) thì một Keychain treo là người dùng kẹt vĩnh viễn ở onboarding.

Đọc hỏng → trả `false` cho cả hai cờ. Đây là hướng an toàn: hiện thừa một lần thì phiền, còn giấu
nhầm thì người dùng mất luôn màn xin quyền và không có đường nào thấy lại.

---

## 4. Quyền microphone — cái hộp thoại chỉ mở một lần

API đã xác minh trên nguồn `expo/expo` nhánh `sdk-57` (không phải trí nhớ):

- `requestRecordingPermissionsAsync()` / `getRecordingPermissionsAsync()` — **export tên ở cấp cao
  nhất** của `expo-audio`. (`AudioModule` cũng có hai hàm này nhưng được đánh dấu `@hidden`.)
- Trả về `{ status: 'granted' | 'denied' | 'undetermined', granted: boolean, canAskAgain: boolean,
  expires: 'never' }`.

Hành vi thật của hệ điều hành:

| Tình huống | `granted` | `canAskAgain` | Gọi lại `request` có hiện hộp thoại? |
|---|---|---|---|
| Chưa hỏi bao giờ | false | true | **Có** |
| iOS, đã từ chối 1 lần | false | **false** | **Không** — resolve ngay |
| Android, từ chối lần 1 | false | true | Có |
| Android, từ chối lần 2 | false | **false** | Không |
| Đã cho phép | true | — | Không cần gọi |

Nên màn hình **không được** chỉ có mỗi nút "Cho phép": trên iOS sau một lần từ chối, nút đó thành
nút chết — bấm mãi không có gì xảy ra. Ba trạng thái hiển thị, rút ra từ một hàm thuần
`resolveMicPermissionView`:

| View | Khi nào | Nút chính | Chạm nút |
|---|---|---|---|
| `ask` | `!granted && canAskAgain` | "Cho phép" | `requestRecordingPermissionsAsync()` |
| `blocked` | `!granted && !canAskAgain` | "Mở Cài đặt" | `openSettings()` của `expo-linking` |
| `granted` | `granted` | — | ghi cờ + `replace('/')` ngay |

`blocked` thêm một dòng giải thích dưới tiêu đề. Đây **không phải** bịa thêm so với design: AC của
**US-07** viết thẳng — *"bị từ chối thì hiển thị hướng dẫn mở phần Cài đặt hệ thống thay vì báo lỗi
trống"*.

`openSettings` lấy từ **`expo-linking`** (đã là dependency `~57.0.10`), không phải từ `react-native`,
để trong app chỉ có một đường import cho Linking.

### Từ chối không chặn đường đi tiếp

Cả "Cho phép" (dù kết quả nào) lẫn "Không, để sau" đều ghi `mic_prompt_seen = true` rồi
`replace('/')` → vào Home. Màn này chỉ trả lời **một** câu: *đã hỏi chưa*.

Câu *đã có quyền chưa* thuộc về lúc bấm ghi âm — Phase 07 của kế hoạch tổng kiểm lại bằng
`getRecordingPermissionsAsync()` ngay tại thời điểm đó. Tách như vậy nên người dùng thu hồi quyền
trong Cài đặt hệ thống cũng **không** bao giờ bị ném ngược về màn xin quyền này; và không có vòng
lặp nào giữa Home ↔ permission.

**Mũi tên quay lại ở góc trái** (design màn 3) dùng **chung đúng handler** với "Không, để sau". Màn
này tới bằng redirect nên không có history để `back()` về — một nút back thật sẽ là ngõ cụt.

---

## 5. Minh họa dựng từ `View`, không thêm thư viện vẽ

Mọi hình trong ba màn này là hình tròn, chữ nhật bo góc, vòng khuyên, viên nhộng hoặc cung tròn —
`borderRadius` + `borderWidth` + `transform: rotate` làm được hết. Một nguyên thể `<Arc />` dùng lại
cho sóng âm màn 3 và vòng đồng tâm.

**Không dùng `react-native-svg`** (chưa cài, dù tên nó có mặt trong `transformIgnorePatterns` của
jest — đó là dấu vết của template, không phải dependency). **Không dùng `expo-linear-gradient`**.

**Cái giá đã chấp nhận:** ô icon app trên splash trong design có **gradient cam**; bản dựng dùng
`colors.primary` phẳng. Ở ~88pt trên máy thật, chênh lệch gần như không đọc ra. Đổi ý thì chỉ phải
thay ruột **một** component (`AppMark`) + thêm `expo-linear-gradient` + một vòng prebuild; không
file nào khác đụng tới.

> **Cảnh báo tách riêng (ngoài phạm vi).** `apps/mobile/assets/icon.png` và `assets/splash-icon.png`
> hiện **vẫn là ảnh mẫu mặc định của Expo** (chữ "A" xanh dương và lưới tròn xám), không phải nhận
> diện Meetio. Cả hai đều **không** dùng trong ba màn này, nhưng `app.json` đang trỏ icon app vào
> `icon.png` — phải thay trước khi phát hành. Vì cùng lý do đó, **native splash không cấu hình trong
> kế hoạch này**: cấu hình nó bây giờ là đóng đinh một ảnh sai.

---

## 6. Onboarding: nút "Bắt đầu" lật trang

Design chỉ vẽ trang 1, mang nhãn "Bắt đầu" và ba chấm (chấm đầu là viên thuốc dài).

**Chọn:** nhãn **giữ nguyên "Bắt đầu"** trên cả ba trang; chạm ở trang 1–2 thì cuộn sang trang kế,
ở trang 3 thì kết thúc onboarding. "Bỏ qua" kết thúc ngay từ bất kỳ trang nào. Vuốt ngang cũng lật
trang được, và ba chấm bám theo trang đang xem.

Vì sao **không** để "Bắt đầu" kết thúc luôn từ trang 1: khi đó trang 2 và 3 chỉ tới được bằng vuốt,
và phần lớn người dùng sẽ không bao giờ thấy nội dung E3/E6 — dựng ba trang rồi giấu mất hai.

Nếu về sau muốn nhãn đổi theo trang ("Tiếp tục" ở trang 1–2, "Bắt đầu" ở trang 3), đó là **một
chuỗi** thêm vào `src/content/onboarding-pages.ts`, không đụng logic.

---

## 7. Nội dung ba trang onboarding

Trang 1 nguyên văn từ design. Trang 2 lấy đề tài từ **E3** (US-17→19), trang 3 từ **E6**
(US-35, 36, 38) — dựa vào spec đã viết, không bịa tính năng.

| Trang | Tiêu đề (2 dòng) | Nguồn |
|---|---|---|
| 1 | Ghi âm & Chuyển đổi / thành văn bản | design.png |
| 2 | Dịch song song / ngay trong cuộc họp | E3 |
| 3 | Đồ thị tri thức / & Hỏi đáp có nguồn | E6 |

Thân bài đầy đủ ở [phase-06](phase-06-onboarding-pager.md). Chữ "Meetio" in đậm giữa câu (design
trang 1 **và** màn 3 đều vậy) do `<BrandedParagraph />` lo — tách "Meetio" thành `<Text>` đậm lồng
trong đoạn, dùng chung cả hai màn.

---

## 8. Màu chữ

**Không thêm token màu nào.** `colors.ts` đã đủ cho ba màn này và đã có test khoá.

**Chữ cam trên nền sáng dùng `colors.primaryStrong`** — áp cho "Bỏ qua" (onboarding) và
"Không, để sau" (màn quyền), cả hai là link chữ trên nền kem. Chữ trắng trên nền `primary`
(`PrimaryButton`, nút mic tròn) giữ nguyên như design, kèm hụt AA đã biết và đã ghi nhận trong
`colors.ts`.

> **Nợ đã phát hiện, không trả trong kế hoạch này.** `app/(app)/index.tsx` và `app/(auth)/login.tsx`
> hiện dùng `colors.primary` cho link chữ trên nền sáng (2,62:1) — đúng thứ mà quy ước cấm. Sửa hai
> file đó nằm ngoài phạm vi ba màn này và sẽ đụng file thuộc phase khác. Ghi vào hand-back.

---

## 9. Vị trí file test

CI có job `assert-no-tests-in-expo-router-app-dir` chặn cứng mọi file test dưới `apps/mobile/app/`.
Lý do đã ghi trong `src/navigation/app-group-layout.test.tsx`: Expo Router biến **mọi** file dưới
`app/` thành route, nên file test ở đó va vào route hàng xóm và kéo global của Jest vào bundle chạy
thật (app crash `Property 'jest' doesn't exist`, trong khi typecheck/lint/test đều xanh).

**Quy ước theo đúng tiền lệ sẵn có:** test nằm trong `apps/mobile/src/`, import ngược lên route bằng
đường dẫn tương đối — giống hệt `src/navigation/app-group-layout.test.tsx` đang
`import AppGroupLayout from '../../app/(app)/_layout'`.

Toàn bộ test cấp route của kế hoạch này vào `src/navigation/`, mỗi phase một file riêng (xem
[file-ownership.md](file-ownership.md)). Không dựng thư mục quy ước mới.

**Cách test không cần cả navigation stack:** `jest.mock('expo-router', ...)` thay `Redirect` / `Stack`
/ `router` bằng `jest.fn()`, render component bằng `react-test-renderer` + `act`, rồi khẳng định
trên lời gọi mock. Logic thuần (`resolveBootstrapRoute`, `resolveMicPermissionView`,
`nextOnboardingPage`) tách hẳn ra `src/` và test trần, không render gì cả.
