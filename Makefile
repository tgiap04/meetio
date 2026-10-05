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
        app-ios app-android app-clean app-doctor app-verify typecheck lint doctor \
        clean clean-ios clean-android disk lan localhost adb-reverse device-ios device-adr

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

env: ## Sinh .env gốc (không ghi đè) + apps/mobile/.env (luôn sinh lại từ .env gốc)
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
			'# Danh sách audience (client ID) mà server chấp nhận cho Google ID token, phân' \
			'# tách bằng dấu phẩy. Để trống = tắt đăng nhập Google (fail safe). Xem README' \
			'# § "Google Sign-In setup" để lấy giá trị.' \
			'GOOGLE_OAUTH_AUDIENCES=' \
			'' \
			'POSTGRES_USER=meetio' \
			'POSTGRES_PASSWORD=meetio' \
			'POSTGRES_DB=meetio' \
			'POSTGRES_PORT=5432' \
			'REDIS_PORT=6379' \
			'' \
			'EXPO_PUBLIC_API_URL=http://localhost:3000/api' \
			'EXPO_PUBLIC_WS_URL=ws://localhost:3000' \
			'# Push: projectId của EAS (công khai) — chạy `cd apps/mobile && npx eas init` để lấy.' \
			'# Để trống = push tắt, app chỉ cảnh báo một dòng.' \
			'EXPO_PUBLIC_EAS_PROJECT_ID=' \
			'# Google Sign-In: client ID là định danh CÔNG KHAI, không phải bí mật. Để trống' \
			'# = plugin native không được thêm, đăng nhập Google tắt. Xem README § "Google' \
			'# Sign-In setup" để lấy ba giá trị này rồi chạy lại `make build-app`.' \
			'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=' \
			'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=' \
			'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=' \
			> .env; \
		echo "  ✅ .env đã sinh, JWT secret random. GEMINI_API_KEY để trống — tự điền khi cần."; \
	fi
	@echo "  Sinh lại apps/mobile/.env từ .env (đầu ra dẫn xuất — luôn ghi đè)..."
	@printf '%s\n' \
		'# Sinh bởi `make env` — đầu ra dẫn xuất, KHÔNG sửa tay, KHÔNG commit.' \
		'# LUÔN bị ghi đè mỗi lần chạy `make env`: đây là bản trích CHỈ khoá' \
		'# EXPO_PUBLIC_* từ .env ở gốc repo, không phải nguồn sự thật thứ hai.' \
		'# Muốn đổi giá trị (vd. trỏ sang IP LAN để test trên máy thật)? Sửa .env' \
		'# gốc rồi chạy lại `make env` — sửa file này sẽ mất ở lần sinh kế tiếp.' \
		'# @expo/env không đi ngược lên gốc repo tìm .env, nên file này tồn tại' \
		'# riêng cho project root của Expo. Tiền tố EXPO_PUBLIC_ nội tuyến thẳng' \
		'# vào bundle client — KHÔNG BAO GIỜ đặt bí mật vào .env gốc dưới tiền tố này.' \
		> apps/mobile/.env
	@grep -E '^EXPO_PUBLIC_' .env >> apps/mobile/.env
	@echo "  ✅ apps/mobile/.env đã sinh lại từ .env."

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

# `--dev-client`, KHÔNG để Expo Go làm mặc định.
#
# Expo Go là app dựng sẵn của Expo: nó chỉ chứa module thuộc Expo SDK. Bốn module
# native của dự án (expo-audio, expo-linear-gradient, expo-secure-store,
# reanimated) đều nằm trong đó, nên Expo Go chạy tốt — cho tới khi thêm
# @react-native-google-signin/google-signin, thư viện bên thứ ba đầu tiên.
#
# Khi đó Expo Go nạp bundle rồi chết ở `TurboModuleRegistry.getEnforcing(...):
# 'RNGoogleSignin' could not be found`, và dòng duy nhất chỉ ra nguyên nhân là
# "Using Expo Go" trôi qua giữa đống log khởi động. Ép dev build ngay từ đầu để
# không ai mất một buổi vì nó nữa. Chưa có dev build? Chạy `make app-ios`.
mobile: env ## Chạy Expo dev server trỏ vào dev build (KHÔNG dùng Expo Go)
	@$(MOBILE) run start -- --dev-client

openapi: ## Sinh openapi.json
	@$(API) run openapi:generate

# --------------------------------------------------- build / app native -----

build-api: ## Build backend ra apps/api/dist
	@$(API) run build
	@echo "  ✅ apps/api/dist/main.js"

build-app: env ## Sinh lại project native (chạy sau khi thêm thư viện native)
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
	scheme="$${EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:-$$(grep -E '^EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=' apps/mobile/.env 2>/dev/null | cut -d= -f2-)}"; \
	if [ -z "$$scheme" ]; then \
		echo "  –  ios google — bỏ qua (chưa cấu hình)"; \
	elif grep -rq 'com\.googleusercontent\.apps\.' apps/mobile/ios/*/Info.plist 2>/dev/null; then \
		echo "  ✅ ios google — URL scheme đã vào Info.plist"; \
	else \
		echo "  ❌ ios google — prebuild làm rơi URL scheme khỏi Info.plist."; \
		echo "     EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME đã đặt nhưng không thấy"; \
		echo "     'com.googleusercontent.apps.' trong apps/mobile/ios/*/Info.plist."; \
		echo "     'expo prebuild' mặc định là clean — nếu plugin không chạy, app sẽ"; \
		echo "     crash NSInvalidArgumentException trên máy thật. Xem README §"; \
		echo "     'Google Sign-In setup' → 'Khi hỏng thì xem gì'."; \
		ok=0; \
	fi; \
	[ "$$ok" = "1" ] || { echo "  → Có nền tảng chưa dựng được (xem trên)."; exit 1; }

app-ios: env ## Build + cài + chạy trên iOS (simulator hoặc máy thật)
	@$(MOBILE) exec expo run:ios

app-android: env ## Build + cài + chạy trên Android
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

# ------------------------------------------------------------- dọn dẹp ------
#
# Build native ăn dung lượng ở HAI nơi, và chỗ to hơn nằm NGOÀI thư mục dự án:
#   apps/mobile/ios            ~1,2 GB  (gần như toàn bộ là Pods)
#   apps/mobile/android        ~1 GB    (.gradle + app/build, sau lần build đầu)
#   ~/Library/.../DerivedData  ~1,7 GB  ← `du -sh` trên repo KHÔNG thấy chỗ này
#
# Mọi thứ các target dưới đây xoá đều là đầu ra sinh lại được: `ios/` và
# `android/` do `expo prebuild` dựng và đã nằm trong .gitignore, DerivedData do
# Xcode dựng. Không có mã nguồn, không có dữ liệu. Đổi lại, lần build kế tiếp
# sẽ lâu vì phải `pod install` lại từ đầu.
#
# KHÔNG đụng tới ~/.gradle (~4,4 GB): nó là cache DÙNG CHUNG cho mọi dự án
# Android trên máy, xoá là các dự án khác phải tải lại hàng GB.

DERIVED_DATA := $(HOME)/Library/Developer/Xcode/DerivedData

# $(1) = nhãn in ra, $(2)... = các đường dẫn cần xoá (bỏ qua nếu không tồn tại)
define purge_paths
	@freed=0; hit=0; \
	for p in $(2); do \
		[ -e "$$p" ] || continue; \
		kb=$$(du -sk "$$p" 2>/dev/null | cut -f1); \
		freed=$$((freed + kb)); hit=1; \
		rm -rf "$$p"; \
		echo "  🗑  $$p"; \
	done; \
	if [ "$$hit" = "1" ]; then \
		if [ "$$freed" -ge 1024 ]; then size="$$((freed / 1024)) MB"; else size="$$freed KB"; fi; \
		echo "  ✅ $(1): giải phóng $$size — dựng lại bằng 'make build-app'."; \
	else \
		echo "  –  $(1): không có gì để dọn."; \
	fi
endef

clean-ios: ## Xoá build iOS (apps/mobile/ios + DerivedData của Meetio)
	$(call purge_paths,iOS,apps/mobile/ios $(DERIVED_DATA)/Meetio-*)

clean-android: ## Xoá build Android (apps/mobile/android + build native trong node_modules)
	$(call purge_paths,Android,apps/mobile/android)
	@# Cache CMake/ninja của từng thư viện native: đổi phiên bản một gói (vd. react-native-worklets)
	@# để lại đường dẫn .so cũ trong cấu hình của gói khác → "ninja: error ... missing and no known rule".
	@rm -rf node_modules/*/android/build node_modules/*/android/.cxx node_modules/@*/*/android/build node_modules/@*/*/android/.cxx
	@echo "  ✅ đã xoá build native trong node_modules — chạy 'make device-adr' để build lại"

clean: clean-ios clean-android ## Dọn toàn bộ đầu ra build native của dự án
	@echo ""
	@echo "  Cache dùng chung KHÔNG bị đụng (cố ý — các dự án khác đang dùng):"
	@s=$$(du -sh $(HOME)/.gradle 2>/dev/null | cut -f1); \
	printf "    %-18s %s  xoá tay nếu thật sự cần\n" "~/.gradle" "$${s:-—}"
	@s=$$(du -sh node_modules 2>/dev/null | cut -f1); \
	printf "    %-18s %s  dựng lại bằng 'yarn install'\n" "node_modules" "$${s:-—}"

# `du` lỗi nhưng `cut` vẫn thoát 0, nên `|| echo '—'` không bao giờ chạy —
# phải bắt chuỗi rỗng bằng `$${s:-—}` thay vì dựa vào mã thoát của pipeline.
disk: ## Xem build native đang chiếm bao nhiêu dung lượng
	@echo "  Trong dự án:"
	@for p in apps/mobile/ios apps/mobile/android node_modules; do \
		s=$$(du -sh "$$p" 2>/dev/null | cut -f1); \
		printf "    %-26s %s\n" "$$p" "$${s:-—}"; \
	done
	@echo "  Ngoài dự án:"
	@s=$$(du -shc $(DERIVED_DATA)/Meetio-* 2>/dev/null | tail -1 | cut -f1); \
	printf "    %-26s %s\n" "DerivedData/Meetio-*" "$${s:-—}"
	@s=$$(du -sh $(HOME)/.gradle 2>/dev/null | cut -f1); \
	printf "    %-26s %s  (dùng chung, 'make clean' không đụng)\n" "~/.gradle" "$${s:-—}"

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

# ------------------------------------------------- máy thật: địa chỉ API -----
#
# EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL được nội tuyến vào bundle lúc Metro
# đóng gói. Trên máy thật, "localhost" là chính cái điện thoại — request không
# bao giờ tới API trên Mac, và terminal không có log nào. Hai cách:
#   - make lan        → trỏ sang IP LAN hiện tại của Mac (Wi-Fi, iOS + Android).
#                       IP đổi mỗi khi đổi mạng → chạy lại lệnh này ở chỗ mới.
#   - make localhost  → về localhost (simulator iOS / emulator / Android cắm cáp
#                       kèm `make adb-reverse`).
# Sửa .env GỐC (nguồn sự thật) rồi sinh lại apps/mobile/.env qua `make env`.
# Sau khi đổi phải khởi động lại Metro với --clear, không thì bundle cũ vẫn giữ host cũ.

ADB := $(shell command -v adb 2>/dev/null || echo $(HOME)/Library/Android/sdk/platform-tools/adb)

# IP LAN của interface đang ra mạng mặc định (macOS), fallback Linux.
LAN_IP = $(shell iface=$$(route -n get default 2>/dev/null | awk '/interface:/{print $$2}'); \
	ip=$$([ -n "$$iface" ] && ipconfig getifaddr "$$iface" 2>/dev/null); \
	[ -n "$$ip" ] || ip=$$(hostname -I 2>/dev/null | awk '{print $$1}'); echo $$ip)

# $(1) = host mới. Giữ nguyên scheme, cổng và đường dẫn (vd. /api) đang có trong .env.
define set_api_host
	@[ -f .env ] || { echo "  ❌ Chưa có .env — chạy 'make env' trước."; exit 1; }
	@sed -E -i.bak \
		-e 's#^(EXPO_PUBLIC_API_URL=[a-z]+://)[^:/]+#\1$(1)#' \
		-e 's#^(EXPO_PUBLIC_WS_URL=[a-z]+://)[^:/]+#\1$(1)#' .env && rm -f .env.bak
	@$(MAKE) --no-print-directory env >/dev/null
	@grep -E '^EXPO_PUBLIC_(API|WS)_URL=' apps/mobile/.env | sed 's/^/  ✅ /'
	@echo "  → Khởi động lại Metro với cache sạch: $(MOBILE) start --dev-client --clear"
endef

lan: ## Trỏ app vào IP LAN hiện tại của Mac (chạy lại mỗi khi đổi mạng)
	@[ -n "$(LAN_IP)" ] || { echo "  ❌ Không tìm thấy IP LAN — đã kết nối Wi-Fi/LAN chưa?"; exit 1; }
	@echo "  IP LAN hiện tại: $(LAN_IP) — điện thoại phải cùng mạng này."
	@# Android đang cắm: so dải mạng (3 octet đầu) của điện thoại với Mac — khác dải là
	@# không gọi được nhau, và app chỉ báo lỗi chung chung mà API không có log nào.
	@phone=$$($(ADB) shell "ip -4 addr show wlan0" 2>/dev/null | awk '/inet /{split($$2,a,"/"); print a[1]}'); \
	if [ -n "$$phone" ] && [ "$${phone%.*}" != "$$(echo $(LAN_IP) | sed 's/\.[0-9]*$$//')" ]; then \
		echo "  ⚠️  Điện thoại Android đang ở $$phone — KHÁC mạng với Mac ($(LAN_IP))."; \
		echo "     Cho điện thoại vào cùng Wi-Fi, hoặc dùng cáp: make localhost && make adb-reverse"; \
	fi
	$(call set_api_host,$(LAN_IP))

localhost: ## Trỏ app về localhost (simulator / emulator / Android qua adb reverse)
	$(call set_api_host,localhost)

adb-reverse: ## Android cắm cáp: chuyển cổng API 3000 + Metro 8081 của máy về Mac
	@$(ADB) reverse tcp:3000 tcp:3000 && $(ADB) reverse tcp:8081 tcp:8081 && \
	echo "  ✅ Điện thoại gọi localhost:3000 / :8081 sẽ tới Mac (mất khi rút cáp)."

device-ios: ## Chạy trên thiết bị ios thật
	@yarn workspace @meetio/mobile ios --device

# Giữ adb reverse SUỐT lúc chạy: Expo khởi động lại Metro, adb hay USB kết nối lại
# đều xoá luật reverse — mất cổng 3000 là login lỗi mà API không có dòng log nào.
# Vòng nền đặt lại mỗi 3 giây (vô hại khi đang dùng IP LAN), dừng khi lệnh kết thúc.
# `expo prebuild` trước: `expo run:android` KHÔNG sinh lại android/ khi thư mục đã có, nên
# config plugin mới (vd. foregroundServiceType=microphone) không vào manifest — app crash
# ngay khi bắt đầu ghi âm. Prebuild không --clean chỉ áp lại cấu hình, nhanh.
device-adr: ## Chạy trên thiết bị android thật (giữ adb reverse 3000/8081 suốt phiên)
	@$(MOBILE) exec expo prebuild --platform android --no-install
	@( while true; do $(ADB) reverse tcp:3000 tcp:3000 >/dev/null 2>&1; \
		$(ADB) reverse tcp:8081 tcp:8081 >/dev/null 2>&1; sleep 3; done ) & \
	keeper=$$!; trap 'kill $$keeper 2>/dev/null' EXIT INT TERM; \
	yarn workspace @meetio/mobile android --device

doctor: ## Kiểm tra môi trường máy
	@echo "  node    : $$(node -v 2>/dev/null || echo 'THIẾU')"
	@echo "  yarn    : $$(yarn -v 2>/dev/null || echo 'THIẾU')"
	@echo "  docker  : $$(docker -v 2>/dev/null | head -1 || echo 'THIẾU')"
	@echo "  daemon  : $$(docker info >/dev/null 2>&1 && echo 'đang chạy' || echo 'CHƯA CHẠY')"
	@echo "  .env    : $$([ -f .env ] && echo 'có' || echo 'THIẾU — chạy make env')"
	@$(DC) ps --format '  {{.Service}}: {{.State}}' 2>/dev/null || true
