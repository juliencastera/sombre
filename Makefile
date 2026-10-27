# Shortcuts for the npm scripts and tools. `make` alone lists the targets.
# Recipes stay plain `npm`/`node` calls so they run under cmd, PowerShell or sh.

# Benchmark options, empty = the script's default (see bench/README.md).
SITES   ?=
TARGETS ?=
SCHEME  ?=
HAR     ?=
HEADED  ?=
# Record: LOGIN=1 opens a browser to log into the test accounts.
LOGIN   ?=
# Extra arguments passed through to the underlying tool (vitest, playwright, bench).
ARGS    ?=

BENCH_FLAGS = $(if $(SITES),--sites=$(SITES)) $(if $(TARGETS),--targets=$(TARGETS)) \
	$(if $(SCHEME),--scheme=$(SCHEME)) $(if $(HAR),--har=$(HAR)) $(if $(HEADED),--headed) $(ARGS)

.DEFAULT_GOAL := help
.PHONY: help install dev build zip icons check test test-watch e2e verify \
	bench-setup bench-record bench fixes-keygen fixes-sign clean

help: ## List the targets
	@node scripts/make-help.ts Makefile

##@ Development

install: ## Install dependencies from the lockfile
	npm ci

dev: ## Dev mode with hot reload (opens Chrome with the extension)
	npm run dev

build: ## Production build into .output/chrome-mv3 (load it unpacked in chrome://extensions)
	npm run build

zip: ## Build and package the extension as a zip for the Chrome Web Store
	npm run zip

icons: ## Regenerate public/icon/*.png
	node scripts/generate-icons.ts

##@ Quality

check: ## Type-check (svelte-check + TypeScript)
	npm run check

test: ## Unit tests (ARGS=tests/unit/color.test.ts to filter)
	npm run test -- $(ARGS)

test-watch: ## Unit tests in watch mode
	npm run test:watch -- $(ARGS)

e2e: ## Build, then end-to-end tests (ARGS=tests/e2e/fixes.spec.ts to filter)
	npm run test:e2e -- $(ARGS)

verify: check test e2e ## Everything before a commit: check, unit and E2E tests

##@ Benchmark

bench-setup: ## Download Dark Reader and the browser for the benchmark
	npm run bench:setup

bench-record: ## Record HAR archives of the real sites (SITES=github, LOGIN=1)
	node bench/scripts/record.ts $(if $(SITES),--sites=$(SITES)) $(if $(LOGIN),--login) $(ARGS)

bench: build ## Build, then benchmark (SITES=real TARGETS=darkreader,sombre HAR=live HEADED=1)
	node bench/run.ts $(BENCH_FLAGS)

##@ Shared fixes

fixes-keygen: ## Create the Ed25519 signing key, once (refuses to overwrite)
	npm run fixes:keygen

fixes-sign: ## Sign fixes/fixes.json into fixes.signed.json and public/
	npm run fixes:sign

##@ Housekeeping

clean: ## Remove build output and test reports
	node -e "for (const d of ['.output', 'test-results', 'playwright-report']) require('fs').rmSync(d, { recursive: true, force: true })"
