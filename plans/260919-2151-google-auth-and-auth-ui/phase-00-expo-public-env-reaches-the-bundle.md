---
phase: 00
title: "EXPO_PUBLIC_* thật sự tới được bundle (lỗi có sẵn)"
status: completed
priority: P1
effort: 1h
blockedBy: []
blocks: [11]
---

# Phase 00 — `EXPO_PUBLIC_*` thật sự tới được bundle

**Liên kết:** [plan.md](plan.md) · [decisions §17](decisions.md) · [file-ownership.md](file-ownership.md) ·
[phase-08](phase-08-google-signin-library-and-native-wrapper.md) ·
[phase-11](phase-11-env-readme-native-rebuild-qa.md)

> **Đây là lỗi CÓ SẴN, đã đo, không phải rủi ro cần khảo sát.** Nó không do đăng nhập Google gây ra
> và không chỉ ảnh hưởng đăng nhập Google — `apiClient.baseURL` đang là `undefined` trong **mọi** bản
> dựng làm theo đúng tài liệu. Đánh số 00 vì nó đứng trước phần việc mới, không phải một phần của nó.

## Tổng quan

`.env` chỉ tồn tại ở **gốc repo**. Project root của Expo là `apps/mobile/`. `@expo/env` **không đi
ngược lên** tìm file. Kết quả: không biến `EXPO_PUBLIC_*` nào tới được bundler, và
`babel-preset-expo` nội tuyến `undefined` vào chỗ lẽ ra là URL máy chủ.

Phase này cho `make env` sinh thêm `apps/mobile/.env` **chỉ chứa khoá `EXPO_PUBLIC_*`**, và để lại
một script kiểm chứng chạy được bất cứ lúc nào.

## Bằng chứng (đã chạy, không phải suy luận)

**1 — `@expo/env` không đi ngược lên gốc repo.** Từ `apps/mobile/`:

```
node -e "const e=require('@expo/env');
         console.log('before:', process.env.EXPO_PUBLIC_API_URL);
         e.load(process.cwd());
         console.log('after :', process.env.EXPO_PUBLIC_API_URL);
         console.log(e.getFiles('development'))"
→ before: undefined
→ after : undefined
→ [ '.env.development.local', '.env.local', '.env.development', '.env' ]
```

Bốn tên file đó đều phân giải **tương đối với project root được truyền vào** — tức `apps/mobile/`,
nơi không có file nào trong số đó. Không có bước đi ngược lên thư mục cha.

**2 — cơ chế nội tuyến chạy tốt, nó chỉ không có gì để nội tuyến.** Cùng một phép biến đổi
`babel-preset-expo`, `NODE_ENV=production`:

| Môi trường | Kết quả biến đổi |
|---|---|
| shell sạch (đúng thứ một bản clone mới + `make env` cho ra) | `var u=undefined;` |
| cùng thế, có export biến trong shell | `var u="http://sentinel-xyz789.invalid";` |

Nên hỏng nằm ở **đường nạp env**, không nằm ở bundler.

**3 — `.gitignore` đã phủ sẵn.** Đã kiểm, không tin lời ai:

```
git check-ignore -v apps/mobile/.env
→ .gitignore:12:.env	apps/mobile/.env
```

Mẫu `.env` ở dòng 12 không có dấu `/` đứng đầu nên khớp ở **mọi độ sâu**. Không phải sửa
`.gitignore`.

> **Không dùng `grep` trên bundle đã export làm bằng chứng — theo chiều nào cũng vậy.** Chuỗi
> `http://localhost:3000` có mặt trong bundle **không** chứng minh biến đã tới nơi: nó cũng nằm
> trong `node_modules/expo-router/build/head/url.js:64` như một giá trị mặc định của thư viện, và
> Hermes gộp các chuỗi giống nhau nên một lần khớp không phân biệt được hai nguồn. Đây là một dương
> tính giả đã thật sự xảy ra trong lúc điều tra.

## Chọn cách sửa: `make env` sinh `apps/mobile/.env` chỉ với khoá `EXPO_PUBLIC_*`

| Cách | Phán quyết |
|---|---|
| **(a) `make env` ghi thêm `apps/mobile/.env`, chỉ gồm khoá `EXPO_PUBLIC_*`** | **CHỌN** |
| (b) symlink `apps/mobile/.env` → `../../.env` | **Loại** |
| (c) Makefile export biến ra môi trường trước khi gọi expo | **Loại** |

**Vì sao loại (b).** Nó đặt `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`GEMINI_API_KEY` **bên trong project root của Expo**, và `@expo/env.load()` sẽ đọc tất cả vào môi
trường tiến trình Metro/CLI. Chúng không bị nội tuyến (chỉ `EXPO_PUBLIC_*` mới bị), nên đây chưa
phải rò rỉ ngay — nhưng nó đặt toàn bộ bí mật máy chủ **cách một lỗi gõ** khỏi bundle client: chỉ
cần ai đó đặt tên `EXPO_PUBLIC_GEMINI_API_KEY` là khoá thật ra thẳng app. Sự an toàn không nên phụ
thuộc vào việc không ai gõ nhầm tiền tố.

**Vì sao loại (c).** Nó chỉ chạy khi người ta đi qua `make mobile`. README **đang** hướng dẫn một
đường không dùng make (`yarn workspace @meetio/mobile run start`); EAS Build và cấu hình chạy trong
IDE cũng đi vòng qua Makefile. Một bản vá chỉ đúng với một cửa vào là cái bẫy tệ nhất trong ba: nó
chạy cho người vừa dựng nó và hỏng im lặng với mọi người khác.

**Vì sao chọn (a).** Đó là **danh sách cho phép, không phải kỷ luật**: file mobile được sinh ra từ
một danh sách khoá cố định, nên "không có bí mật trong file env của mobile" là **tính chất cấu
trúc** chứ không phải điều phải nhớ. Nó chạy với **mọi** cửa vào, vì `@expo/env` đọc project root
bất kể ai khởi động bundler. Và `.gitignore` đã phủ sẵn (bằng chứng 3).

**Cái giá:** hai file env thay vì một. Giảm nhẹ bằng cách buộc **`make env` là nơi ghi duy nhất** —
file mobile là **đầu ra dẫn xuất**, sinh lại chứ không sửa tay; README nói thẳng điều đó.

## Nhận định then chốt

- **`make env` hiện không ghi đè `.env` đã tồn tại.** Giữ nguyên tính chất đó, nhưng nó phải **vẫn
  tạo `apps/mobile/.env`** khi file gốc đã có — nếu không, tất cả những người đang có `.env` (tức là
  mọi người đang làm việc) vẫn hỏng nguyên.
- **`app.config.ts` của phase 08 cũng phụ thuộc chỗ này.** Expo CLI chạy `@expo/env` trên project
  root trước khi đánh giá config, nên nếu không có phase 00 thì entry plugin có điều kiện **không
  bao giờ kích hoạt được** dù đã điền `.env` gốc. Phase 08 khởi công song song được (test của nó tự
  đặt biến), nhưng đường kích hoạt thật là của phase này.
- **Không tạo `apps/mobile/.env.example`.** Một file ví dụ ở gốc là đủ và là nguồn sự thật duy nhất
  cho "có những khoá nào"; thêm cái thứ hai là thêm một thứ để lệch nhau. (Lưu ý phụ: dòng
  `!.env.example` sẽ **bỏ ignore** nó nếu ai đó tạo — nên đừng tạo rồi để lẫn.)

## Yêu cầu

**Chức năng**

1. `Makefile` target `env` sinh thêm `apps/mobile/.env`, nội dung **chỉ** gồm danh sách cho phép:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3000/api
   EXPO_PUBLIC_WS_URL=ws://localhost:3000
   ```
   Cùng giá trị mà target đang ghi vào `.env` gốc (Makefile:95–96) — một nguồn, hai đích.
   - `.env` gốc đã có ⇒ giữ nguyên như hiện tại, **nhưng vẫn tạo `apps/mobile/.env` nếu nó thiếu**;
   - `apps/mobile/.env` đã có ⇒ giữ nguyên, in một dòng nói vậy;
   - in một dòng nhắc: đây là **đầu ra dẫn xuất**, sinh lại bằng `make env`, đừng sửa tay.
2. `apps/mobile/scripts/check-public-env.cjs` — script kiểm chứng (xem §Thiết kế script).
   Gọi thẳng bằng đường dẫn; **không** thêm alias vào `apps/mobile/package.json` — file đó do phase
   08 sở hữu trong cùng đợt, và một alias không đổi lấy được gì (YAGNI).
3. `README.md`:
   - mục "Setup": một câu nói `make setup` sinh **hai** file env, và vì sao file mobile chỉ có
     `EXPO_PUBLIC_*`;
   - khối `<details>` "Without make": thêm bước tạo `apps/mobile/.env`;
   - một câu: `apps/mobile/.env` là đầu ra dẫn xuất, **không sửa tay**, và **không bao giờ** đặt bí
     mật vào đó vì `EXPO_PUBLIC_*` đi thẳng vào bundle client.

**Phi chức năng**

- Không sửa code ứng dụng. `axios-client.ts` **không đụng tới** — nó vốn đã đúng; cái hỏng là đường
  nạp env.
- Không sửa `.gitignore` (bằng chứng 3).
- Không sửa `apps/mobile/package.json` (phase 08 sở hữu, cùng đợt).
- Script < 60 dòng.

## Thiết kế script — và cái bẫy nó phải tránh

Phép kiểm ngây thơ ("biến đổi rồi xem có `undefined` không") **đậu sai** dưới
`NODE_ENV=development`. Đã đo:

| NODE_ENV | Không có `apps/mobile/.env` | Kết quả biến đổi |
|---|---|---|
| `production` | — | `var u=undefined;` ⇒ bắt được |
| `development` | — | `var _env2=require("expo/virtual/env");var u=_env2.env.EXPO_PUBLIC_API_URL;` ⇒ **không có chữ `undefined`, đậu oan** |

Ở chế độ development, `babel-preset-expo` **không nội tuyến** mà chuyển thành tra cứu lúc chạy. Nên
script phải tự bảo vệ, không được trông vào shell của người gọi:

1. **Tự đặt `process.env.NODE_ENV = 'production'`** ở dòng đầu, trước khi nạp bất cứ thứ gì.
2. **Tự `delete` các khoá cần kiểm khỏi `process.env`** trước khi gọi `load()` — để một biến đã
   export trong shell **không thể** làm nó đậu. Chỉ file mới được phép cung cấp giá trị.
3. Khẳng định đầu ra **chứa đúng giá trị đọc được từ file** (`JSON.stringify(expected)`), không chỉ
   "khác `undefined`".

Đã kiểm bản đã làm cứng trên bốn tình huống:

| Tình huống | Kỳ vọng | Đo được |
|---|---|---|
| A. hiện trạng, shell sạch | FAIL | `exit 1`, "absent after @expo/env.load(apps/mobile)" |
| B. không có file, **có export biến trong shell** | FAIL | `exit 1` — không đậu oan |
| C. có `apps/mobile/.env`, shell đang `NODE_ENV=development` | PASS | `exit 0` |
| D. file chỉ có một trong hai khoá | FAIL | `exit 1`, gọi tên khoá thiếu |

## Luồng dữ liệu

```
make env
  ├─► .env                 (gốc repo)   — server + docker + EXPO_PUBLIC_*   → apps/api đọc
  └─► apps/mobile/.env                  — CHỈ EXPO_PUBLIC_*                 → @expo/env đọc
                                                     │
                                  expo start / expo config / expo export
                                                     ▼
                                    process.env của tiến trình Metro
                                                     ▼
                     babel-preset-expo nội tuyến EXPO_PUBLIC_* vào bundle
                                                     ▼
                         axios-client.ts  baseURL = "http://localhost:3000/api"
                         app.config.ts    plugin google-signin (phase 08)
```

Bí mật máy chủ **không bao giờ** đi vào nhánh dưới: chúng chỉ tồn tại ở file gốc, và file mobile
được sinh từ một danh sách cho phép.

## File liên quan

Tạo: `apps/mobile/scripts/check-public-env.cjs`
Sửa: `Makefile` (target `env`) · `README.md`

## Các bước triển khai

1. Viết `check-public-env.cjs` trước; chạy nó ngay — **phải thoát 1** (đó là tình huống A, hiện trạng).
2. Sửa target `env` trong Makefile.
3. Xoá `apps/mobile/.env` nếu có, chạy `make env`, chạy lại script — **phải thoát 0**.
4. Kiểm tình huống B (export biến, không có file) — vẫn phải thoát 1.
5. Cập nhật README.
6. Chạy `make mobile` và xác nhận bằng mắt app gọi đúng máy chủ (đăng nhập bằng tài khoản seed).

## Todo

- [ ] `check-public-env.cjs` (tự pin production · tự xoá khoá · so đúng giá trị)
- [ ] Xác nhận script thoát **1** trên hiện trạng
- [ ] `make env` sinh `apps/mobile/.env` (kể cả khi `.env` gốc đã có)
- [ ] `node apps/mobile/scripts/check-public-env.cjs` thoát 0 sau khi chạy `make env`
- [ ] README: Setup · "Without make" · cảnh báo không đặt bí mật
- [ ] Xác nhận trên máy: đăng nhập tài khoản seed chạy được

## Tiêu chí nghiệm thu (quan sát được)

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 1 | `rm -f apps/mobile/.env && (cd apps/mobile && node scripts/check-public-env.cjs)` | thoát **1**, nêu tên khoá thiếu — chứng minh phép kiểm có khả năng thất bại |
| 2 | `make env && (cd apps/mobile && node scripts/check-public-env.cjs)` | thoát **0** |
| 3 | `rm -f apps/mobile/.env && (cd apps/mobile && EXPO_PUBLIC_API_URL=http://x.invalid EXPO_PUBLIC_WS_URL=ws://x.invalid node scripts/check-public-env.cjs)` | thoát **1** — biến export trong shell không được phép làm đậu |
| 4 | sau `make env`: `cd apps/mobile && NODE_ENV=development node scripts/check-public-env.cjs` | thoát **0** — script tự pin production, không lệ thuộc shell |
| 5 | `git check-ignore -v apps/mobile/.env` | khớp `.gitignore:12:.env` |
| 6 | `! grep -qE '^(DATABASE_URL\|JWT_\|GEMINI\|POSTGRES_\|REDIS_)' apps/mobile/.env` | thoát **0** (không khớp gì) — không bí mật nào lọt vào file mobile. Dùng `! grep -q` chứ không `grep -c`: `grep -c` trả 1 khi đếm được 0, đọc nhầm thành thất bại |
| 7 | `.env` gốc đã tồn tại + xoá `apps/mobile/.env` + `make env` | `.env` gốc **không bị ghi đè**, `apps/mobile/.env` **được tạo lại** |
| 8 | `grep -c 'apps/mobile/.env' README.md` | `>= 1` |
| 9 | `yarn typecheck && yarn lint && yarn test` | thoát 0 |
| 10 | Trên máy: `make dev` + `make mobile`, đăng nhập bằng tài khoản seed | thành công — `baseURL` đã trỏ đúng máy chủ. **Không** dùng `grep` bundle làm bằng chứng |

## Rủi ro

| Rủi ro | Khả năng × Tác động | Đối sách |
|---|---|---|
| Có người "gộp cho gọn" bằng symlink về `.env` gốc | Trung × Cao | Lý do loại bỏ nằm ngay trong file này và ở [decisions §17](decisions.md); AC #6 biến nó thành lỗi đo được |
| Hai file env lệch nhau sau khi sửa tay | Trung × Trung | `make env` là nơi ghi duy nhất; README ghi rõ file mobile là đầu ra dẫn xuất; AC #2 chạy lại được bất cứ lúc nào |
| Phép kiểm đậu oan dưới `NODE_ENV=development` | **Cao** (nếu viết ngây thơ) × Cao | Script tự pin production; AC #4 khoá đúng tình huống đó |
| Phép kiểm đậu nhờ biến export trong shell CI | Trung × Cao | Script tự `delete` khoá trước khi `load()`; AC #3 khoá |
| Người đang có `.env` cũ chạy `make env` và tưởng không có gì xảy ra | Cao × Trung | Target in một dòng riêng cho từng file; AC #7 |
| Sửa lan sang `axios-client.ts` | Thấp × Trung | Ngoài phạm vi — file đó vốn đúng, hỏng là ở đường nạp env |

## Bảo mật

- **Đây chính là mặt bảo mật của phase.** `EXPO_PUBLIC_*` được **nội tuyến thẳng vào bundle client**
  — bất kỳ ai có file app đều đọc được. Nên file env của mobile phải là **danh sách cho phép do máy
  sinh**, không phải bản sao của file gốc được lọc bằng kỷ luật con người.
- **Cách (b) bị loại đúng vì lý do bảo mật**, không phải vì thẩm mỹ: nó đặt `JWT_*`, `DATABASE_URL`
  và `GEMINI_API_KEY` vào trong project root của Expo, cách một lỗi gõ tiền tố khỏi việc ra thẳng
  bundle. AC #6 biến "không có bí mật trong file mobile" thành thứ đo được.
- `.gitignore` phủ `apps/mobile/.env` ở dòng 12 (**đã kiểm bằng `git check-ignore`**, không đoán).
  AC #5 giữ điều đó đúng cả về sau.
- README phải nói rõ: **không bao giờ** thêm khoá vào `apps/mobile/.env` với tiền tố
  `EXPO_PUBLIC_` nếu giá trị là bí mật. Tiền tố đó **là** tuyên bố "cái này công khai".

## Đường lùi

`git revert`. `apps/mobile/.env` là file bị gitignore và do máy sinh — xoá là xong, không có gì
trong lịch sử. Lùi đưa mọi thứ về đúng trạng thái hỏng hiện tại, nên "lùi" ở đây nghĩa là **quay lại
lỗi**, không phải quay lại an toàn. Đó là lý do nó là phase 00 chứ không phải một mục trong danh sách
việc vặt.

## Tiếp theo

Mở khóa **11**. Phase **08** chạy song song được, nhưng AC #3 của nó (`expo config` có entry plugin
google-signin) phải **export biến trong shell** cho tới khi phase 00 xong — sau đó đường kích hoạt
thật là `apps/mobile/.env`.
