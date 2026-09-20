# Meetio

AI meeting-room assistant: on-device recording + real-time transcription, a backend GraphRAG
pipeline, and cross-meeting Q&A with citations.

See [`user_stories.md`](user_stories.md), [`docs/system-architecture.md`](docs/system-architecture.md),
[`docs/data-model.md`](docs/data-model.md), and [`docs/api-spec.md`](docs/api-spec.md) for the
full specification. Implementation plan lives under
[`plans/260917-1821-meetio-full-implementation/`](plans/260917-1821-meetio-full-implementation/plan.md).

## Interface design

![Meetio — 14 screens](design.png)

[`design.png`](design.png) is the visual source for the whole app. The master plan's
"Thiết kế giao diện" section maps each of the 14 screens to the phase that builds it, and the
palette in `apps/mobile/src/theme/colors.ts` is sampled from this file rather than chosen by eye.

Screens 1–3 (splash, onboarding, microphone permission) are built — see
[`plans/260918-0033-mobile-splash-onboarding-permission/`](plans/260918-0033-mobile-splash-onboarding-permission/plan.md).

## Monorepo layout

```
apps/api/            NestJS backend — REST + WebSocket, TypeORM, @nestjs/swagger
apps/mobile/          Expo Router app — React Native client
packages/shared/      Shared TypeScript contract types ONLY (zero runtime dependencies)
infra/postgres-init/  Postgres extension bootstrap for docker-compose
docker-compose.yml    Postgres 15 + pgvector, Redis 7
```

`packages/shared` is the single source of truth for `MeetingStatus`, `ProcessingStep`,
`EntityType`, `ActionStatus`, `ApiErrorCode`, the auth/user DTOs, and the 8 WebSocket payloads.
It contains **no decorators and no runtime dependencies** — CI enforces this — so it can be
imported by both `apps/api` (as an `implements` target for validated DTOs) and `apps/mobile`
without ever pulling server code into the React Native bundle.

## Prerequisites

- Node.js 20+ (developed against v24)
- Yarn 4 via Corepack (`corepack enable`) — this repo pins `packageManager: yarn@4.9.2`
- Docker (for Postgres + Redis)

## Setup

```bash
corepack enable
make setup       # .env + yarn install + Postgres/Redis + migrations + seed
```

`make setup` generates **two** env files: a **working** `.env` at the repo root for local dev
(matching the docker-compose credentials, with freshly generated JWT secrets — no hand-filling
required, only `GEMINI_API_KEY` is left blank because it is a real secret), and
`apps/mobile/.env`, which is **derived** from it — `make env` extracts every `^EXPO_PUBLIC_` line
out of the root `.env` and writes only those into `apps/mobile/.env`. The second file exists
because Expo's config loader (`@expo/env`) resolves `.env` relative to the Expo project root
(`apps/mobile/`) and does not walk up to the repo root, so the root `.env` alone never reaches
the mobile bundler.

The root `.env` is never overwritten once it exists — it holds hand-entered secrets and randomly
generated JWT keys. `apps/mobile/.env` is the opposite: it holds no secret of its own, so
**`make env` always regenerates it from the root file, every time, even if it already exists.**
Never hand-edit `apps/mobile/.env` — any edit is lost on the next `make env`, and it would leave a
second, disagreeing copy of a fact that only the root `.env` should hold. To change a value (e.g.
pointing the app at a LAN IP to test on a real device), edit the `EXPO_PUBLIC_*` lines in the
**root** `.env` and re-run `make env`. Never add a non-`EXPO_PUBLIC_*` key under that prefix in
the root `.env` either — it is inlined straight into the client bundle, so anything under it must
be treated as public.

> **If you already have a root `.env` from before this change:** check its
> `EXPO_PUBLIC_API_URL` line. The backend listens with a global route prefix, so the correct value
> is `http://localhost:3000/api` (with the `/api` suffix) — an older `.env` without the suffix
> will send every mobile request to a 404. `make env` will not fix this for you, by design: it
> never touches a root `.env` that already exists, because that file also holds your JWT secrets.
> Fix that one line by hand, then run `make env` to regenerate `apps/mobile/.env` from it.

Run `make` on its own to list every command.

## Daily use

```bash
make dev         # Postgres + Redis (waits until healthy) + migrations + API in watch mode
make mobile      # Expo dev server
```

| Command | Does |
|---------|------|
| `make up` / `make down` | start / stop Postgres + Redis (`down` keeps your data) |
| `make ps` / `make logs` | container status / follow logs |
| `make psql` / `make redis-cli` | open a shell inside the container |
| `make migrate` / `make seed` | run migrations / load sample data |
| `make db-reset` | rebuild the schema and reseed — **destroys data**, asks first |
| `make reset-hard` | drop containers **and volumes**, rebuild — **destroys everything**, asks first |
| `make check` | build + typecheck + lint + test, the same gate as CI |
| `make build-api` | compile the backend to `apps/api/dist` |
| `make doctor` | check your machine has what it needs |

### Native builds (`apps/mobile`)

The app uses Expo **Continuous Native Generation**: `ios/` and `android/` are build
output, generated from `app.json` plus the installed config plugins, and are gitignored.

`expo start` alone is enough while the JavaScript changes. **Adding or upgrading a
library with native code is different** — the native project has to be regenerated and
the app reinstalled on the device, or the new module simply will not exist at runtime.
This already applies today: `expo-audio` (microphone permission) is a native module, added
via a config plugin that auto-injects the Android `RECORD_AUDIO` permission — run
`make build-app` after pulling changes that touch it. It matters even more from Phase 07
onward, where on-device speech recognition is itself a native module.

| Command | Does |
|---------|------|
| `make build-app` | regenerate `ios/` + `android/` — run this after adding a native library |
| `make app-ios` / `make app-android` | build, install and launch on a simulator or device |
| `make app-clean` | delete both native folders and regenerate — asks first |
| `make app-doctor` | check installed packages match the Expo SDK versions |

`expo prebuild` recreates the native folders by default in this SDK (`--no-clean` is the
incremental option), so `make build-app` is already a clean regeneration.

Two things the Makefile handles so you do not have to:

- **`expo prebuild` exits 0 even when `pod install` fails**, leaving an `ios/` folder with
  no `.xcworkspace` that cannot be built. `make build-app` therefore verifies the result
  and fails loudly per platform instead of trusting the exit code.
- On macOS it pins `DEVELOPER_DIR`, and `SDKROOT` **for the pod step only**, to the Xcode
  toolchain. Without it CocoaPods can pick the Command Line Tools SDK and die with
  `tapi error: malformed file … unknown architecture`. `SDKROOT` is deliberately not set
  for `make app-ios`, which needs the iphoneos SDK rather than the macOS one.

Typical loop after adding a native dependency:

```bash
yarn workspace @meetio/mobile add <native-lib>
make build-app     # regenerate native projects
make app-ios       # rebuild and reinstall on the device
```

Swagger UI: <http://localhost:3000/api/docs>

#### Dọn dung lượng build native

Build native chiếm chỗ ở **hai** nơi, và chỗ lớn hơn nằm **ngoài** thư mục dự án — nên
`du -sh` trên repo sẽ báo thiếu. Số đo thật trên một máy đã build iOS một lần:

| | |
|---|---|
| `apps/mobile/ios` | ~1,2 GB (gần như toàn bộ là Pods) |
| `apps/mobile/android` | ~1 GB sau lần build Android đầu tiên |
| `~/Library/Developer/Xcode/DerivedData/Meetio-*` | ~1,7 GB ← ngoài dự án |

```bash
make disk           # xem đang chiếm bao nhiêu, cả trong lẫn ngoài dự án
make clean-ios      # xoá ios/ + DerivedData của Meetio
make clean-android  # xoá android/
make clean          # cả hai
```

Mọi thứ các lệnh trên xoá đều **sinh lại được**: `ios/` và `android/` do `expo prebuild`
dựng và đã nằm trong `.gitignore`; `DerivedData` do Xcode dựng. Không có mã nguồn, không có
dữ liệu. Cái giá là lần build kế tiếp lâu hơn vì phải `pod install` lại từ đầu — chạy
`make build-app` khi cần dùng lại.

`make clean` **cố ý không đụng** `~/.gradle` (thường 4 GB+). Đó là cache dùng chung cho mọi
dự án Android trên máy; xoá nó là bắt các dự án khác tải lại hàng GB. Muốn dọn thì xoá tay,
và hiểu rõ nó ảnh hưởng tới cái gì.

Khác với `make app-clean`, vốn xoá **rồi dựng lại ngay** để chữa lỗi native lạ, nhóm lệnh
`clean*` chỉ xoá và dừng — mục đích là lấy lại dung lượng, không phải sửa build.

### Google Sign-In setup

Google sign-in ships **disabled by default** — every key below is blank in `make env`'s
output, the server logs `Google sign-in DISABLED` at boot, and `make build-app` produces the
exact same native project as before this feature existed. Enabling it needs a project in
[Google Cloud Console](https://console.cloud.google.com/) and four values filled into `.env`.

1. **Create a project, enable the OAuth consent screen.** Google Cloud Console →
   "APIs & Services" → "OAuth consent screen". Internal or External (Testing) is fine for
   development.
2. **Create a Web application OAuth client ID.** This single value does double duty:
   - mobile: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   - server: `GOOGLE_OAUTH_AUDIENCES`

   **Why the same client ID on both platforms:** the native SDK always mints its ID token
   with `webClientId` set as the audience (`aud` claim) — including on iOS — because that is
   the only client type the token-issuing flow recognizes as the app's identity. Skip
   `webClientId` on either platform and `GoogleSignin` never returns an `idToken`.
3. **Create an iOS OAuth client ID**, bundle ID `com.tobi-04.meetio`. It gives you two values:
   - the client ID itself → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - the **reversed client ID** (e.g. `com.googleusercontent.apps.123-abc`, shown right next
     to the client ID in the console) → `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`
4. **Create an Android OAuth client ID**, package `com.tobi_04.meetio`, plus the SHA-1 of the
   signing key. Get the debug one with:

   ```bash
   keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore \
           -storepass android -keypass android
   ```

   or `cd apps/mobile/android && ./gradlew signingReport`. The Android client ID value itself
   is **never referenced anywhere in the code** — only its existence, registered against the
   right SHA-1, matters. And **every signing configuration needs its own Android client**:
   debug, release, EAS Build, and Play App Signing are four different certificates, so a
   release build signed with a key whose SHA-1 was never registered fails exactly like an
   unconfigured one.
5. **Fill the four keys into `.env`**: `GOOGLE_OAUTH_AUDIENCES` plus the three
   `EXPO_PUBLIC_GOOGLE_*` keys `make env` already left blank for you.
6. **`make build-app`, then `make app-ios` / `make app-android`.** The config plugin only
   injects the URL scheme into `Info.plist` (and links the native module) at prebuild time —
   editing `.env` alone does nothing until you regenerate the native projects.

#### Khi hỏng thì xem gì (troubleshooting)

| Symptom | Cause |
|---|---|
| `TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found` | you are running in **Expo Go**, which can never contain this library — it is third-party native code, and Expo Go only ships Expo SDK modules. Look for `Using Expo Go` in the startup log. Build and install the dev build with `make app-ios` / `make app-android`; `make mobile` now passes `--dev-client` so it will not silently fall back to Expo Go. The same error on a dev build means the binary predates the dependency — rebuild it |
| Android `DEVELOPER_ERROR` (code 10) | the SHA-1 of the signing key you built with was never registered on an Android OAuth client for `com.tobi_04.meetio` — see step 4 |
| iOS crashes with `NSInvalidArgumentException` mentioning URL schemes | the reversed client ID never made it into `Info.plist`. Run `make app-verify` — it greps for exactly this and fails loudly if the scheme is missing after prebuild |
| `GoogleSignin` resolves but `idToken` is `null` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is missing — `webClientId` is required on **both** platforms to get an ID token, not just the platform-specific client |
| `POST /auth/google` returns `500 INTERNAL_ERROR` saying the server is not configured | `GOOGLE_OAUTH_AUDIENCES` is empty on the API side — fill it with the **same** Web client ID from step 2 and restart the API |

**Client IDs are public identifiers, not secrets** — they ship inside the mobile bundle, inside
the generated `Info.plist`, and inside `.env.example`, and that is correct. Do not move them to
a secrets store: that only breaks the native build, since the config plugin reads them from
`.env` at prebuild time. `GOOGLE_OAUTH_AUDIENCES`, on the other hand, **is** a security boundary
on the server: leaving it blank fails safe (Google sign-in off); filling it with the wrong
client ID means the server accepts ID tokens minted for a different application.

### Replaying onboarding

The onboarding and microphone-permission screens each set a flag in
`expo-secure-store`, so they show once per device and never again. On iOS that store
is the **Keychain, which survives deleting the app** — reinstalling does not bring the
screens back. (Android keeps them in `EncryptedSharedPreferences`, which the uninstall
does wipe, so the two platforms behave differently here.)

Development builds therefore carry a dashed **"Đặt lại onboarding (DEV)"** button on
the login and settings screens — the two screens reachable once the flow is done,
signed out and signed in respectively. It clears both flags and replaces to `/`, and
the bootstrap resolver sends you back to the start of the flow.

The button is behind `__DEV__`, which Metro substitutes and dead-code eliminates, so
it cannot reach a release build; `src/components/dev/dev-reset-button.test.tsx` asserts
that it renders nothing when the flag is false.

### Swagger access (`SWAGGER_ENABLED`)

Swagger publishes every route, schema and auth scheme, so serving it is opt-in and
**fails safe**:

| `SWAGGER_ENABLED` | `/api/docs` |
|---|---|
| `true` · `1` · `yes` · `on` | served |
| unset or empty | served only when `NODE_ENV !== 'production'` |
| anything else (including a typo) | **not served** |

When disabled, `/api/docs` answers `404 NOT_FOUND` — the same as any unknown route, so
it does not confirm a docs endpoint exists. The boot log states which mode it is in, so
"is Swagger exposed on this box?" is answerable from logs rather than by probing.

Precedence is real environment > `.env` in the process CWD > the `NODE_ENV` default.
A production container that ships no `.env` and sets nothing lands on the default: **off**.

`yarn openapi:generate` is unaffected — it builds the document without serving it, so
CI keeps working in every environment.

<details>
<summary>Without make</summary>

```bash
yarn install
cp .env.example .env        # then fill in every value by hand
grep -E '^EXPO_PUBLIC_' .env > apps/mobile/.env   # @expo/env does not walk up to the repo root
                                                   # — see Setup above; re-run after any change
                                                   # to an EXPO_PUBLIC_* line in the root .env
docker compose up -d --wait
yarn workspace @meetio/api run migration:run
yarn workspace @meetio/api run start:dev
yarn workspace @meetio/mobile run start
```

</details>

## Workspace-wide scripts

```bash
yarn typecheck   # tsc --noEmit across every workspace
yarn lint        # eslint across the repo
yarn test        # per-workspace test suites
yarn build       # per-workspace build, topologically ordered
```

## Contract discipline

- JSON on the wire stays **snake_case** exactly as `docs/api-spec.md` writes it
  (`access_token`, `started_at_ms`, `meeting_id`, `next_cursor`). Do not camelCase it.
- DTO classes in `apps/api` `implements` the matching interface from `@meetio/shared` —
  renaming or dropping a shared field is a compile error in `apps/api`.
- `packages/shared/package.json` must keep an empty `dependencies` object. A single
  `yarn add` there pulls server code into the mobile bundle; CI fails the build if it happens.
