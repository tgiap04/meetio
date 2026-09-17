# Meetio — local dev shortcuts
#
# Cần: docker, yarn 4 (corepack), node 24.
# Chạy `make` (hoặc `make help`) để xem toàn bộ lệnh.
#
# Lần đầu clone repo:  make setup
# Mỗi ngày đi làm:     make dev

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Đọc cấu hình từ .env nếu có, không thì lấy đúng default của docker-compose.yml.
# Dùng grep thay cho `include .env` để giá trị có ký tự lạ không làm vỡ Makefile.
PG_USER  := $(shell grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2-)
PG_DB    := $(shell grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2-)
PG_PORT  := $(shell grep -E '^POSTGRES_PORT=' .env 2>/dev/null | cut -d= -f2-)
RD_PORT  := $(shell grep -E '^REDIS_PORT=' .env 2>/dev/null | cut -d= -f2-)

PG_USER  := $(if $(PG_USER),$(PG_USER),meetio)
PG_DB    := $(if $(PG_DB),$(PG_DB),meetio)
PG_PORT  := $(if $(PG_PORT),$(PG_PORT),5432)
RD_PORT  := $(if $(RD_PORT),$(RD_PORT),6379)

# macOS: ép toolchain về Xcode.app.
# Nếu không có, `pod install` trong `expo prebuild` sẽ nhặt SDK của
# CommandLineTools (ví dụ MacOSX27.0) trong khi linker của Xcode 26.x không đọc
# được, và chết với "tapi error: malformed file ... unknown architecture".
# Chỉ export khi xcode-select thật sự trỏ vào một Xcode.app — không phải CLT.
XCODE_DEV_DIR := $(shell xcode-select -p 2>/dev/null)
ifeq ($(findstring Xcode.app,$(XCODE_DEV_DIR)),Xcode.app)
export DEVELOPER_DIR := $(XCODE_DEV_DIR)
# `pod install` chạy một script stub build cho macOS; nó phải dùng macOS SDK của
# Xcode, không phải của CLT. DEVELOPER_DIR một mình KHÔNG đủ — đã đo.
# Chỉ áp cho bước pod: `expo run:ios` cần SDK iphoneos, ép SDKROOT macOS vào đó
# sẽ phá build app.
POD_ENV := SDKROOT=$(shell xcrun --sdk macosx --show-sdk-path 2>/dev/null)
endif

DC  := docker compose
API    := yarn workspace @meetio/api
MOBILE := yarn workspace @meetio/mobile

.PHONY: help setup env install up down restart ps logs logs-db logs-redis \
        psql redis-cli migrate migrate-down seed db-reset reset-hard \
        dev api mobile openapi test check build build-api build-app \
        app-ios app-android app-clean app-doctor app-verify typecheck lint doctor

# ---------------------------------------------------------------- help -------

help: ## Hiện danh sách lệnh
	@echo ""
	@echo "  Meetio — lệnh dev nhanh"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Lần đầu:  make setup     (env + cài deps + db + migrate + seed)"
	@echo "  Hằng ngày: make dev      (bật db/redis rồi chạy API watch)"
	@echo ""

# --------------------------------------------------------------- setup -------

setup: env install up migrate seed ## Dựng toàn bộ môi trường dev từ đầu
	@echo ""
	@echo "  ✅ Xong. Chạy 'make dev' để bật API, 'make mobile' để bật Expo."
	@echo "     Swagger: http://localhost:3000/api/docs"
	@echo ""

env: ## Sinh .env chạy được ngay (không ghi đè nếu đã có)
	@if [ -f .env ]; then \
		echo "  .env đã tồn tại — giữ nguyên, không ghi đè."; \
	else \
		echo "  Sinh .env cho local dev..."; \
		printf '%s\n' \
			'# Sinh bởi `make env` — chỉ dùng cho local dev. KHÔNG commit file này.' \
			'NODE_ENV=development' \
			'' \
			'PORT=3000' \
			'DATABASE_URL=postgresql://meetio:meetio@localhost:5432/meetio' \
			'REDIS_URL=redis://localhost:6379' \
			"JWT_ACCESS_SECRET=$$(openssl rand -hex 32)" \
			"JWT_REFRESH_SECRET=$$(openssl rand -hex 32)" \
			'# Khóa thật, tự điền. Để trống thì pipeline AI (Phase 11+) không chạy được.' \
			'GEMINI_API_KEY=' \
			'CORS_ORIGIN=http://localhost:8081' \
			'# Swagger tại /api/docs. Để trống = tự tắt ở production.' \
			'SWAGGER_ENABLED=true' \
			'' \
			'POSTGRES_USER=meetio' \
			'POSTGRES_PASSWORD=meetio' \
			'POSTGRES_DB=meetio' \
			'POSTGRES_PORT=5432' \
			'REDIS_PORT=6379' \
			'' \
			'EXPO_PUBLIC_API_URL=http://localhost:3000/api' \
			'EXPO_PUBLIC_WS_URL=ws://localhost:3000' \
			> .env; \
		echo "  ✅ .env đã sinh, JWT secret random. GEMINI_API_KEY để trống — tự điền khi cần."; \
	fi

install: ## yarn install
	@yarn install

# -------------------------------------------------------------- docker -------

up: ## Bật Postgres + Redis, chờ tới khi healthy
	@$(DC) up -d --wait
	@echo "  ✅ Postgres :$(PG_PORT)  ·  Redis :$(RD_PORT)  — sẵn sàng"

down: ## Tắt container (GIỮ nguyên dữ liệu)
	@$(DC) down
	@echo "  Đã tắt. Dữ liệu vẫn còn — dùng 'make reset-hard' nếu muốn xóa sạch."

restart: down up ## Tắt rồi bật lại

ps: ## Trạng thái container
	@$(DC) ps

logs: ## Xem log cả hai service (Ctrl-C để thoát)
	@$(DC) logs -f

logs-db: ## Xem log Postgres
	@$(DC) logs -f postgres

logs-redis: ## Xem log Redis
	@$(DC) logs -f redis

# ------------------------------------------------------------- db shell -----

psql: ## Mở psql trong container
	@$(DC) exec postgres psql -U $(PG_USER) -d $(PG_DB)

redis-cli: ## Mở redis-cli trong container
	@$(DC) exec redis redis-cli

# ------------------------------------------------------------ migrations ----

migrate: ## Chạy migration
	@$(API) run migration:run

migrate-down: ## Lùi migration gần nhất
	@$(API) run migration:revert

seed: ## Nạp dữ liệu mẫu
	@$(API) run db:seed

db-reset: ## Xóa DB, dựng lại schema + seed (MẤT DỮ LIỆU)
	@printf "  ⚠️  Xóa toàn bộ dữ liệu trong '$(PG_DB)' rồi migrate + seed lại. Gõ 'yes' để tiếp: "; \
	read ans; \
	if [ "$$ans" = "yes" ]; then \
		$(DC) exec -T postgres psql -U $(PG_USER) -d postgres \
			-c "DROP DATABASE IF EXISTS $(PG_DB) WITH (FORCE);" -c "CREATE DATABASE $(PG_DB);" && \
		$(DC) exec -T postgres psql -U $(PG_USER) -d $(PG_DB) \
			-c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;" && \
		$(MAKE) migrate seed && \
		echo "  ✅ Database đã dựng lại."; \
	else \
		echo "  Đã hủy — không đụng gì."; \
	fi

reset-hard: ## Xóa container + volume, dựng lại từ đầu (MẤT SẠCH)
	@printf "  ⚠️  Xóa container VÀ volume (mất sạch dữ liệu Postgres + Redis). Gõ 'yes' để tiếp: "; \
	read ans; \
	if [ "$$ans" = "yes" ]; then \
		$(DC) down -v && \
		$(MAKE) up migrate seed && \
		echo "  ✅ Môi trường đã dựng lại từ con số không."; \
	else \
		echo "  Đã hủy — không đụng gì."; \
	fi

# ----------------------------------------------------------------- dev ------

dev: up migrate ## Bật hạ tầng rồi chạy API ở chế độ watch
	@# Không in link ở đây: API tự log URL thật lúc boot, kèm cả trạng thái Swagger.
	@# Hardcode lại sẽ sai khi đổi PORT hoặc khi SWAGGER_ENABLED=false.
	@$(API) run start:dev

api: ## Chạy API (không watch)
	@$(API) run start

mobile: ## Chạy Expo dev server
	@$(MOBILE) run start

openapi: ## Sinh openapi.json
	@$(API) run openapi:generate

# --------------------------------------------------- build / app native -----

build-api: ## Build backend ra apps/api/dist
	@$(API) run build
	@echo "  ✅ apps/api/dist/main.js"

build-app: ## Sinh lại project native (chạy sau khi thêm thư viện native)
	@echo "  Sinh lại ios/ và android/ từ app.json + config plugin..."
	@$(POD_ENV) $(MOBILE) exec expo prebuild || true
	@$(MAKE) --no-print-directory app-verify

app-verify: ## Kiểm tra project native sinh ra có dùng được không
	@ok=1; \
	if [ -f apps/mobile/android/gradlew ]; then \
		echo "  ✅ android — sẵn sàng (make app-android)"; \
	else \
		echo "  ❌ android — thiếu gradlew, prebuild chưa xong"; ok=0; \
	fi; \
	if [ "$$(uname)" != "Darwin" ]; then \
		echo "  –  ios — bỏ qua (chỉ build được trên macOS)"; \
	elif ls apps/mobile/ios/*.xcworkspace >/dev/null 2>&1; then \
		echo "  ✅ ios — sẵn sàng (make app-ios)"; \
	else \
		echo "  ❌ ios — KHÔNG có .xcworkspace: 'pod install' đã thất bại."; \
		echo "     'expo prebuild' vẫn thoát 0 dù pod lỗi, nên phải kiểm riêng chỗ này."; \
		echo "     Makefile đã ép DEVELOPER_DIR + SDKROOT về Xcode cho bước pod."; \
		echo "     Nếu vẫn lỗi, kiểm tra:"; \
		echo "       xcode-select -p        (phải trỏ vào Xcode.app, không phải CommandLineTools)"; \
		echo "       make app-doctor        (thư viện lệch phiên bản SDK)"; \
		echo "       cd apps/mobile/ios && SDKROOT=\$$(xcrun --sdk macosx --show-sdk-path) pod install"; \
		ok=0; \
	fi; \
	[ "$$ok" = "1" ] || { echo "  → Có nền tảng chưa dựng được (xem trên)."; exit 1; }

app-ios: ## Build + cài + chạy trên iOS (simulator hoặc máy thật)
	@$(MOBILE) exec expo run:ios

app-android: ## Build + cài + chạy trên Android
	@$(MOBILE) exec expo run:android

app-clean: ## Xoá hẳn ios/ android/ rồi sinh lại (khi native lỗi lạ)
	@printf "  ⚠️  Xoá apps/mobile/ios và apps/mobile/android rồi sinh lại. Gõ 'yes' để tiếp: "; \
	read ans; \
	if [ "$$ans" = "yes" ]; then \
		rm -rf apps/mobile/ios apps/mobile/android && \
		$(POD_ENV) $(MOBILE) exec expo prebuild && \
		echo "  ✅ Native dựng lại từ con số không."; \
	else \
		echo "  Đã hủy — không đụng gì."; \
	fi

app-doctor: ## Kiểm tra phiên bản thư viện có khớp Expo SDK không
	@cd apps/mobile && npx expo-doctor

# --------------------------------------------------------------- checks -----

test: ## Chạy toàn bộ test
	@yarn test

typecheck: ## Kiểm kiểu
	@yarn typecheck

lint: ## Lint
	@yarn lint

build: ## Build tất cả workspace (JS/TS — không phải native)
	@yarn build

check: build typecheck lint test ## Chạy đủ cổng như CI

doctor: ## Kiểm tra môi trường máy
	@echo "  node    : $$(node -v 2>/dev/null || echo 'THIẾU')"
	@echo "  yarn    : $$(yarn -v 2>/dev/null || echo 'THIẾU')"
	@echo "  docker  : $$(docker -v 2>/dev/null | head -1 || echo 'THIẾU')"
	@echo "  daemon  : $$(docker info >/dev/null 2>&1 && echo 'đang chạy' || echo 'CHƯA CHẠY')"
	@echo "  .env    : $$([ -f .env ] && echo 'có' || echo 'THIẾU — chạy make env')"
	@$(DC) ps --format '  {{.Service}}: {{.State}}' 2>/dev/null || true
