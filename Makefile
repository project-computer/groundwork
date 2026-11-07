# Root task runner for the polyglot repo (TypeScript + Go + Rust).
#
# All JS tooling (pnpm, lockfile, node_modules) lives inside the JS apps
# (`apps/clinic`, `apps/landing`); Make is the one orchestrator that reaches
# across languages. `make help` lists everything; targets with a language
# suffix (`lint-go`, `test-ts`) are the building blocks, the bare verbs
# (`lint`, `test`, `ci`) run them all.

CLINIC  := apps/clinic
LANDING := apps/landing
SIDECAR := apps/sidecar
SERVER  := server
TAURI   := $(CLINIC)/src-tauri

# Target triple for staging the sidecar binary where Tauri expects it.
# Tauri's externalBin lookup requires an .exe suffix on Windows.
TRIPLE      := $(shell rustc -vV 2>/dev/null | awk '/^host:/{print $$2}')
EXE_EXT     := $(if $(findstring windows,$(TRIPLE)),.exe,)
SIDECAR_BIN := $(TAURI)/binaries/clinic-core-$(TRIPLE)$(EXE_EXT)
SIDECAR_SRC := $(shell find $(SIDECAR)/cmd $(SIDECAR)/internal -name '*.go' 2>/dev/null)

GOLANGCI := github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0
GOVULN   := golang.org/x/vuln/cmd/govulncheck@v1.9.0

# Cloudflare Pages hosting for the PoCs: pinned wrangler, one Pages project
# per SPA (each gets its own <project>.<account>.pages.dev URL).
WRANGLER      := wrangler@4.156.0
PAGES_CLINIC  ?= vetcare-clinic
PAGES_LANDING ?= vetcare-landing

.DEFAULT_GOAL := help
SHELL := bash
.DELETE_ON_ERROR:

.PHONY: help install dev dev-landing build build-clinic build-landing tauri sidecar api vetcare
.PHONY: lint lint-ts lint-landing lint-go lint-rust
.PHONY: fmt fmt-go fmt-rust
.PHONY: test test-ts test-landing test-go test-rust test-pages test-screenshots vuln-go
.PHONY: pages-init deploy deploy-clinic deploy-landing
.PHONY: i18n-extract i18n-compile ci

help: ## list targets and what they do
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---------- day-to-day ----------

install: ## install JS deps (pnpm, inside apps/clinic and apps/landing)
	pnpm -C $(CLINIC) install
	pnpm -C $(LANDING) install

dev: ## Vite dev server (browser, localStorage adapter)
	pnpm -C $(CLINIC) dev

dev-landing: ## download page dev server (port 1421)
	pnpm -C $(LANDING) dev

build: build-clinic build-landing ## production web build (tsc + vite, clinic + landing)

build-clinic: ## production web build of the clinic app
	pnpm -C $(CLINIC) build

build-landing: ## production build of the download page
	pnpm -C $(LANDING) build

tauri: ## desktop shell (sidecar + SQLite), via the Tauri CLI
	pnpm -C $(CLINIC) tauri dev

# ---------- Go sidecar ----------

## The staged binary Tauri bundles; rebuilt only when its Go sources change.
sidecar: $(SIDECAR_BIN)

$(TAURI)/binaries:
	mkdir -p $@

$(SIDECAR_BIN): $(SIDECAR_SRC) $(SIDECAR)/go.mod | $(TAURI)/binaries
	@test -n '$(TRIPLE)' || { echo 'rustc not found — cannot determine the target triple to stage the sidecar'; exit 1; }
	cd $(SIDECAR) && go build -trimpath -o bin/clinic-core ./cmd/clinic-core
	cp $(SIDECAR)/bin/clinic-core $(SIDECAR_BIN)

# ---------- Go REST API (offline-MVP; lives inside the server module) ----------

api: ## build the normalized REST backend (server/cmd/vetcare)
	cd $(SERVER) && go build -trimpath -o bin/vetcare ./cmd/vetcare

## The staged vetcare binary Tauri bundles; rebuilt only when its Go sources
## change (sidecar discipline: same staging, same announcement contract).
VETCARE_BIN := $(TAURI)/binaries/vetcare-$(TRIPLE)$(EXE_EXT)
SERVER_SRC := $(shell find $(SERVER)/cmd $(SERVER)/internal -name '*.go' 2>/dev/null)

vetcare: $(VETCARE_BIN)

$(VETCARE_BIN): $(SERVER_SRC) $(SERVER)/go.mod | $(TAURI)/binaries
	@test -n '$(TRIPLE)' || { echo 'rustc not found — cannot determine the target triple to stage vetcare'; exit 1; }
	cd $(SERVER) && go build -trimpath -o bin/vetcare ./cmd/vetcare
	cp $(SERVER)/bin/vetcare $(VETCARE_BIN)

# ---------- linting & formatting ----------

lint: lint-ts lint-landing lint-go lint-rust ## every linter (TS, Go, Rust)

lint-ts: ## oxlint in apps/clinic + knip (unused files/exports)
	pnpm -C $(CLINIC) lint
	pnpm -C $(CLINIC) exec knip

lint-landing: ## oxlint in apps/landing
	pnpm -C $(LANDING) lint:strict

lint-go: ## Go: vet + golangci-lint + gofmt check (server module)
	cd $(SERVER) && go vet ./...
	cd $(SERVER) && go run $(GOLANGCI) run ./...
	@unformatted=$$(cd $(SERVER) && gofmt -l .); \
	if [ -n "$$unformatted" ]; then \
		echo 'Go files need gofmt:'; echo "$$unformatted"; exit 1; \
	fi

lint-rust: ## Tauri shell: cargo fmt --check + clippy -D warnings
	cargo fmt --check --manifest-path $(TAURI)/Cargo.toml
	cargo clippy --manifest-path $(TAURI)/Cargo.toml --all-targets -- -D warnings

fmt: fmt-go fmt-rust ## format everything

fmt-go: ## gofmt the server
	cd $(SERVER) && gofmt -w .

fmt-rust: ## rustfmt the Tauri shell
	cargo fmt --manifest-path $(TAURI)/Cargo.toml

vuln-go: ## govulncheck — reachable known CVEs in the server
	cd $(SERVER) && go run $(GOVULN) ./...

# ---------- tests ----------

test: test-ts test-landing test-go test-rust ## every test suite (builds the sidecar first)

# Screenshot baselines are pixel-exact against the dev machine's fonts, so
# they only pass where they were generated — keep them out of CI (issue 0018).
test-ts: ## vitest in apps/clinic (unit + component; screenshots are local-only)
	pnpm -C $(CLINIC) test:ci

test-screenshots: ## visual baselines — dev machine only (pnpm test:screenshot:update to re-pin)
	pnpm -C $(CLINIC) test:screenshot

test-landing: ## vitest in apps/landing (unit)
	pnpm -C $(LANDING) test

test-go: ## go test -race in every Go module (sidecar + cloud/offline server)
	cd $(SIDECAR) && go test -race ./...
	cd $(SERVER) && go test -race ./...

test-rust: ## cargo tests for the Tauri shell (stages the sidecar first)
	$(MAKE) sidecar
	cargo test --manifest-path $(TAURI)/Cargo.toml

test-pages: ## Playwright page tests against the Vite dev server
	pnpm -C $(CLINIC) test:pages

# ---------- i18n ----------

i18n-extract: ## sync lingui catalogs with source strings
	pnpm -C $(CLINIC) i18n:extract

i18n-compile: ## compile catalogs, strict ICU validation
	pnpm -C $(CLINIC) i18n:compile

# ---------- deploy (Cloudflare Pages) ----------
#
# Shareable PoC URLs for both SPAs. One-time setup per machine and account:
#   pnpm dlx wrangler login    (or export CLOUDFLARE_API_TOKEN)
#   make pages-init
# After that `make deploy` builds and uploads both apps; wrangler prints the
# URLs. The clinic web build runs fully in the browser on the localStorage
# adapter — no sidecar, no server. Deploys pin --branch=main so every upload
# refreshes the production URL instead of spawning preview URLs.

pages-init: ## one-time: create the two Cloudflare Pages projects
	@for name in $(PAGES_CLINIC) $(PAGES_LANDING); do \
		pnpm dlx $(WRANGLER) pages project list | grep -q "$$name" || \
			pnpm dlx $(WRANGLER) pages project create $$name --production-branch=main; \
	done

deploy: deploy-clinic deploy-landing ## build + upload both SPAs to Cloudflare Pages

deploy-clinic: build-clinic ## upload the clinic app (browser/localStorage build)
	pnpm dlx $(WRANGLER) pages deploy $(CLINIC)/dist \
		--project-name=$(PAGES_CLINIC) --branch=main --commit-dirty=true

deploy-landing: build-landing ## upload the download page
	pnpm dlx $(WRANGLER) pages deploy $(LANDING)/dist \
		--project-name=$(PAGES_LANDING) --branch=main --commit-dirty=true

# ---------- CI ----------

ci: lint-ts lint-landing test-ts test-landing lint-go vuln-go test-go lint-rust ## exactly what the CI workflow runs
