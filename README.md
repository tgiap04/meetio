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

`make setup` generates a **working** `.env` for local dev (matching the docker-compose
credentials, with freshly generated JWT secrets) — no hand-filling required. Only
`GEMINI_API_KEY` is left blank, because it is a real secret. An existing `.env` is never
overwritten.

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
