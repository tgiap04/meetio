---
phase: 10
title: "Nối dây hai route auth"
status: completed
priority: P1
effort: 2h
blockedBy: [06, 07, 09]
blocks: [11]
---

# Phase 10 — Nối dây `(auth)/login` + `(auth)/register`

**Liên kết:** [plan.md](plan.md) · [decisions §10 (route mỏng)](decisions.md) ·
[file-ownership.md](file-ownership.md) · [phase-06](phase-06-login-form-body.md) ·
[phase-07](phase-07-register-form-body.md) · [phase-09](phase-09-google-sign-in-hook.md)

## Tổng quan

Chỗ duy nhất trong kế hoạch mà nhánh A và nhánh C gặp nhau. Hai file route bị **rút mỏng** còn hook
+ điều hướng, mọi thứ nhìn thấy được đã nằm trong `LoginForm`/`RegisterForm`.

Đây cũng là chỗ **ngày hôm nay hai màn auth mới thật sự đổi** — trước phase này, người dùng vẫn thấy
form cũ dù toàn bộ component mới đã sống trong `src/`.

## Nhận định then chốt

- **Không được đặt file test dưới `apps/mobile/app/`.** CI có job
  `assert-no-tests-in-expo-router-app-dir` chặn cứng; Expo Router biến **mọi** file dưới `app/` thành
  route. Test cấp route vào `src/navigation/`, import ngược lên bằng đường dẫn tương đối — đúng tiền
  lệ `src/navigation/app-group-layout.test.tsx`.
- **Không thêm điều hướng nào sau khi đăng nhập.** `persistSession` lật `authStatus` sang
  `authenticated`, `(auth)/_layout.tsx` redirect về `'/'`, `app/index.tsx` quyết định đích. Gọi
  `router.replace('/(app)')` ở đây sẽ **bỏ qua màn xin quyền micro** — đúng lỗi mà kế hoạch trước đã
  phải đi sửa. Bất biến: **mọi lối "xong" đều `replace('/')`**, và ở đây thì thậm chí không cần gọi
  gì cả.
- Điều hướng qua lại login↔register dùng `router.push` (hoặc `Link`), giữ nguyên hành vi hiện tại.
- Sau phase này `LoginForm` và `RegisterForm` chắc chắn có phần lặp lại. **Không gọn hoá ở đây** —
  đó là việc của `code-simplifier` sau khi phase 10 xanh, không phải việc của một phase nối dây.

## Yêu cầu

**Chức năng**

1. `app/(auth)/login.tsx` còn lại:
   ```
   const loginMutation = useLoginMutation();
   const google = useGoogleSignIn();
   return <LoginForm
     email … password …
     onSubmit={() => loginMutation.mutate({ email, password })}
     submitting={loginMutation.isPending}
     errorMessage={loginMutation.isError ? getErrorMessage(loginMutation.error) : null}
     onGooglePress={google.start}
     googlePending={google.isPending}
     googleErrorMessage={google.errorMessage}
     onNavigateToRegister={() => router.push('/(auth)/register')}
   />;
   ```
2. `app/(auth)/register.tsx` — đối xứng, với `useRegisterMutation()` và ba giá trị.
3. `src/navigation/login-screen.test.tsx` và `register-screen.test.tsx`: mock `expo-router`,
   mock hai hook, render route, khẳng định dây nối.

**Phi chức năng**

- Mỗi file route < 60 dòng.
- Không file test nào dưới `app/`.
- Không sửa `(auth)/_layout.tsx`, `route-guards.ts`, `bootstrap-route.ts`.

## Luồng dữ liệu

```
app/(auth)/login.tsx
   ├─ useLoginMutation()  ──► /auth/login  ──► persistSession ──┐
   ├─ useGoogleSignIn()   ──► /auth/google ──► persistSession ──┤
   └─ <LoginForm … />                                           │
                                                                ▼
                                   session.store.authStatus = 'authenticated'
                                                                ▼
                          (auth)/_layout.tsx  ──Redirect──►  '/'
                                                                ▼
                          app/index.tsx  ──resolveBootstrapRoute──►  /(app)/permission | /(app)
```

**Hai đường đăng nhập hợp lưu tại `persistSession`** và từ đó trở đi không phân biệt được. Đó là
toàn bộ lý do endpoint Google trả `AuthTokenPair` thay vì một kiểu riêng.

## File liên quan

Sửa: `apps/mobile/app/(auth)/login.tsx` · `apps/mobile/app/(auth)/register.tsx`
Tạo: `apps/mobile/src/navigation/login-screen.test.tsx` · `register-screen.test.tsx`

## Các bước triển khai

1. Rút `login.tsx` xuống còn state + hai hook + `<LoginForm/>`.
2. Làm tương tự `register.tsx`.
3. Viết hai file test cấp route theo khuôn `permission-screen.test.tsx`.
4. `yarn test` toàn repo; đối chiếu tổng số test xanh không giảm.

## Todo

- [ ] `login.tsx` rút mỏng
- [ ] `register.tsx` rút mỏng
- [ ] `src/navigation/login-screen.test.tsx`
- [ ] `src/navigation/register-screen.test.tsx`
- [ ] Xác nhận không file test nào dưới `app/`

## Tiêu chí nghiệm thu (quan sát được)

| # | Test / lệnh | Kỳ vọng |
|---|---|---|
| 1 | `yarn typecheck && yarn lint && yarn test` | thoát 0 |
| 2 | `find apps/mobile/app -type f \( -name '*.test.*' -o -name '*.spec.*' \)` | **rỗng** (đúng cổng CI) |
| 3 | `LoginScreen cắm useGoogleSignIn().start vào onGooglePress của LoginForm` | pass |
| 4 | `LoginScreen truyền lỗi Google xuống googleErrorMessage, không lẫn vào errorMessage` | pass |
| 5 | `LoginScreen không gọi router.replace sau khi đăng nhập thành công` — `router.replace` mock **không** được gọi | pass. Ca này khoá đúng lỗi "bỏ qua màn quyền micro" |
| 6 | `RegisterScreen gọi mutate với đủ display_name/email/password` | pass |
| 7 | `RegisterScreen cắm useGoogleSignIn` | pass |
| 8 | `wc -l "apps/mobile/app/(auth)/login.tsx" "apps/mobile/app/(auth)/register.tsx"` | mỗi file `< 60` |
| 9 | `git diff --name-only` | **không chứa** `_layout.tsx`, `route-guards.ts`, `bootstrap-route.ts` |
| 10 | `yarn workspace @meetio/mobile run test` | tổng test xanh **≥** con số trước phase 10 |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Thêm `router.replace('/(app)')` "cho chắc" ⇒ người mới **không bao giờ** thấy màn xin quyền micro | **Cao** × Cao | AC #5 khoá bằng test. Đây là lỗi kế hoạch trước đã gặp và đã sửa — đừng tái phát |
| Đặt file test cạnh route ⇒ CI đỏ, mà lint/typecheck/test đều xanh | Trung × Trung | AC #2 chạy đúng lệnh mà CI chạy |
| Gọn hoá phần chung của hai form ngay trong phase này ⇒ đụng file của phase 06/07 | Trung × Trung | Cấm tường minh; để `code-simplifier` làm sau |
| Route phình lại vì logic lạc vào | Trung × Thấp | AC #8 đặt trần 60 dòng |

## Bảo mật

- Route **không đụng token**. `persistSession` (trong hook) là nơi duy nhất ghi secure-store; phase
  này không thêm một chỗ ghi nào.
- Không log `props`, không log `mutation.error` — object lỗi axios mang theo cả config request, tức
  là cả thân request có mật khẩu trong đó.
- Guard của `(auth)` giữ nguyên: người đã đăng nhập không quay lại được hai màn này.
- Hai đường lỗi vẫn tách biệt tới tận UI (AC #4), nên không có thông báo nào vô tình gợi ý email nào
  đã tồn tại.

## Đường lùi

`git revert` một commit đưa hai route về bản cũ. Component mới trong `src/` vẫn còn nhưng không ai
render — **không hỏng gì**, và bật lại chỉ là revert của revert. Đây là lợi ích trực tiếp của việc
tách thân form khỏi route.

## Tiếp theo

Mở khóa **11** — phase cuối: env, README, dựng native, xác minh, QA máy thật.
