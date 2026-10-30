# Root task runner for the polyglot repo (TypeScript + Go + Rust).
#
# All JS tooling (pnpm, lockfile, node_modules, knip) lives inside
# `apps/clinic`; Make is the one orchestrator that reaches across
# languages. `make help` lists everything; targets with a language suffix
# (`lint-go`, `test-ts`) are the building blocks, the bare verbs (`lint`,
# `test`, `ci`) run them all.

CLINIC  := apps/clinic
SIDECAR := apps/sidecar
BACKEND := backend
TAURI   := $(CLINIC)/src-tauri

# Target triple for staging the sidecar binary where Tauri expects it.
TRIPLE      := $(shell rustc -vV 2>/dev/null | awk '/^host:/{print $$2}')
SIDECAR_BIN := $(TAURI)/binaries/clinic-core-$(TRIPLE)
SIDECAR_SRC := $(shell find $(SIDECAR)/cmd $(SIDECAR)/internal -name '*.go' 2>/dev/null)

GOLANGCI := github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0
GOVULN   := golang.org/x/vuln/cmd/govulncheck@v1.9.0

.DEFAULT_GOAL := help
SHELL := bash
.DELETE_ON_ERROR:

.PHONY: help install dev build tauri sidecar
.PHONY: lint lint-ts lint-go lint-rust
.PHONY: fmt fmt-go fmt-rust
.PHONY: test test-ts test-go test-rust test-pages vuln-go
.PHONY: i18n-extract i18n-compile ci

help: ## list targets and what they do
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---------- day-to-day ----------

install: ## install JS deps (pnpm, inside apps/clinic)
	pnpm -C $(CLINIC) install

dev: ## Vite dev server (browser, localStorage adapter)
	pnpm -C $(CLINIC) dev

build: ## production web build (tsc + vite)
	pnpm -C $(CLINIC) build

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

# ---------- linting & formatting ----------

lint: lint-ts lint-go lint-rust ## every linter (TS, Go, Rust)

lint-ts: ## oxlint in apps/clinic + knip (unused files/exports)
	pnpm -C $(CLINIC) lint
	pnpm -C $(CLINIC) exec knip

lint-go: ## backend: go vet + golangci-lint + gofmt check
	cd $(BACKEND) && go vet ./...
	cd $(BACKEND) && go run $(GOLANGCI) run ./...
	@unformatted=$$(cd $(BACKEND) && gofmt -l .); \
	if [ -n "$$unformatted" ]; then \
		echo 'Files need gofmt:'; echo "$$unformatted"; exit 1; \
	fi

lint-rust: ## Tauri shell: cargo fmt --check + clippy -D warnings
	cargo fmt --check --manifest-path $(TAURI)/Cargo.toml
	cargo clippy --manifest-path $(TAURI)/Cargo.toml --all-targets -- -D warnings

fmt: fmt-go fmt-rust ## format everything

fmt-go: ## gofmt the backend
	cd $(BACKEND) && gofmt -w .

fmt-rust: ## rustfmt the Tauri shell
	cargo fmt --manifest-path $(TAURI)/Cargo.toml

vuln-go: ## govulncheck — reachable known CVEs in the backend
	cd $(BACKEND) && go run $(GOVULN) ./...

# ---------- tests ----------

test: test-ts test-go test-rust ## every test suite (builds the sidecar first)

test-ts: ## vitest in apps/clinic (unit + component + screenshot)
	pnpm -C $(CLINIC) test

test-go: ## go test -race in every Go module (sidecar + cloud backend)
	cd $(SIDECAR) && go test -race ./...
	cd $(BACKEND) && go test -race ./...

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

# ---------- CI ----------

ci: lint-ts test-ts lint-go vuln-go test-go lint-rust ## exactly what the CI workflow runs
