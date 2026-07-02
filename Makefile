# ── World Cup 2026 Bracket — project automation ──
#
# Usage:
#   make setup      one-time: install deps + create .env
#   make sync       pull latest results into public/results.json
#   make dev        sync results, then start the dev server
#   make watch      re-sync every 5 minutes (run in a second terminal on match days)
#   make build      production build (syncs first)
#   make help       show this list
#
# Expects to live in the root of a Vite React project containing
# sync-worldcup.mjs, with WorldCupBracket.jsx rendered from src/.

# Load .env if present and export its vars to child processes
-include .env
export

SHELL := /bin/bash
.DEFAULT_GOAL := help

NODE_MIN := 18
SYNC_SCRIPT := sync-worldcup.mjs
RESULTS := public/results.json

# ──────────────────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "World Cup 2026 Bracket"
	@echo "──────────────────────"
	@grep -E '^#   make' Makefile | sed 's/^#   //'
	@echo ""

.PHONY: check-node
check-node:
	@command -v node >/dev/null 2>&1 || { echo "✗ Node.js not found — install Node $(NODE_MIN)+ first"; exit 1; }
	@node -e "process.exit(parseInt(process.versions.node) >= $(NODE_MIN) ? 0 : 1)" \
		|| { echo "✗ Node $(NODE_MIN)+ required, found $$(node -v)"; exit 1; }
	@echo "✓ Node $$(node -v)"

.PHONY: check-key
check-key:
	@if [ -z "$(FOOTBALL_DATA_KEY)" ]; then \
		echo "✗ FOOTBALL_DATA_KEY is not set."; \
		echo "  Run 'make setup' or add it to .env:"; \
		echo "  FOOTBALL_DATA_KEY=your_key_here"; \
		exit 1; \
	fi
	@echo "✓ API key present"

.PHONY: setup
setup: check-node
	@echo "→ Installing dependencies…"
	@npm install
	@if [ ! -f .env ]; then \
		read -p "Enter your football-data.org API key: " key; \
		echo "FOOTBALL_DATA_KEY=$$key" > .env; \
		echo "✓ Created .env"; \
	else \
		echo "✓ .env already exists"; \
	fi
	@grep -qxF '.env' .gitignore 2>/dev/null || { echo '.env' >> .gitignore; echo "✓ Added .env to .gitignore"; }
	@mkdir -p public
	@echo ""
	@echo "Setup done. Next: make dev"

.PHONY: sync
sync: check-key
	@echo "→ Syncing results from football-data.org…"
	@node $(SYNC_SCRIPT)

.PHONY: dev
dev: sync
	@echo "→ Starting dev server…"
	@npm run dev

# Re-sync every 5 minutes — free tier allows 10 req/min, this uses 1 per 5 min.
.PHONY: watch
watch: check-key
	@echo "→ Watching: syncing every 5 minutes (Ctrl+C to stop)…"
	@while true; do \
		node $(SYNC_SCRIPT) || echo "sync failed — retrying in 5 min"; \
		sleep 300; \
	done

.PHONY: build
build: sync
	@npm run build
	@echo "✓ Production build ready (dist/ includes latest $(RESULTS))"

.PHONY: preview
preview:
	@npm run preview

.PHONY: clean
clean:
	@rm -f $(RESULTS)
	@rm -rf dist
	@echo "✓ Removed $(RESULTS) and dist/"
