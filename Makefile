# wpcapng — Wireshark for the web
#
# Run `make help` to see everything. The common path is just `make dev`.

# Use bash so the sync-wasm script and sourcing behave consistently.
SHELL := /bin/bash
NPM   ?= npm

# Marker files let make skip work that's already done.
WASM     := src/wasm/libpcapng.mjs
NODE_DEPS := node_modules/.package-lock.json

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@echo "wpcapng — make targets:"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Quick start:  make dev   (builds the WASM engine, installs deps, opens the dev server)"

# ── build steps ─────────────────────────────────────────────────────────────

$(NODE_DEPS): package.json ## (internal) install node dependencies when they change
	$(NPM) install

.PHONY: install
install: $(NODE_DEPS) ## Install node dependencies

$(WASM): ## (internal) build the libpcapng WASM engine
	$(NPM) run sync-wasm

.PHONY: wasm
wasm: $(WASM) ## Build the libpcapng WASM engine (needs Emscripten + a libpcapng checkout)

.PHONY: dev
dev: install wasm ## Run the dev server with live reload (http://localhost:5173/wpcapng/)
	$(NPM) run dev

.PHONY: build
build: install wasm ## Build the production site into dist/
	$(NPM) run build

.PHONY: preview
preview: build ## Serve the production build locally to check it
	$(NPM) run preview

# ── maintenance ─────────────────────────────────────────────────────────────

.PHONY: rebuild-wasm
rebuild-wasm: ## Force a rebuild of the WASM engine
	rm -f $(WASM)
	$(NPM) run sync-wasm

.PHONY: clean
clean: ## Remove build output and the generated WASM engine
	rm -rf dist $(WASM)

.PHONY: distclean
distclean: clean ## clean + remove installed node_modules
	rm -rf node_modules
