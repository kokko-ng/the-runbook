# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (run from `backend/`; `uv run` works against the checked-in `.venv`, or use `.venv/bin/python` directly):

```bash
uv run python manage.py validate_content        # content lint + objective coverage gate
uv run python manage.py validate_content --partial          # while a chapter is half-written
uv run python manage.py validate_content --require-all-chapters  # the release/CI gate
uv run python manage.py build_content           # compile content/ -> frontend/public/content
uv run python -m pytest -q                      # all backend tests
uv run python -m pytest tests/test_api.py -k save   # one test by file/keyword
uv run python manage.py runserver               # http://127.0.0.1:8000
```

Frontend (run from `frontend/`):

```bash
npm run dev          # http://localhost:5173, proxies /api and /legal to :8000
npm run test         # vitest engine tests
npx vitest run -t "name"   # one test by name
npm run typecheck    # vue-tsc only
npm run build        # typecheck + production build
```

Repo-wide: `pre-commit run --all-files` (fast checks only — yamllint, ruff, gitleaks, actionlint; the content linter, tests and builds stay in CI). Run the full check suite (validate_content, pytest, npm test, npm run build) before pushing: **a push to `main` that passes CI deploys straight to production** on PythonAnywhere. A commit can opt out with `[skip deploy]` in its message.

The content bundle under `frontend/public/content/` is generated and gitignored — run `build_content` after editing anything under `content/`, and never edit the JSON by hand.

## Architecture

Three layers with one-way data flow: authored YAML content → a compiled JSON bundle → a pure client-side game engine. There is no language model and no server-side game logic at runtime.

**Content pipeline** (`content/` + `backend/content_pipeline/core.py`): one YAML file per quest under `content/quests/act{1,2}/`, validated against `content/schema/*.schema.json` plus a house-style linter in `core.py` (single correct option per encounter, rep ranges, 250-word beats, mandatory hints/post-mortems/post-incident reviews, en-US spelling, realistic `az` commands). `build_content` compiles everything into a deterministic bundle whose version hash doubles as the cache key. The coverage gate fails the build if any of the 131 AZ-104/AZ-305 objectives loses its encounter. Content-writing rules are documented in README.md ("Writing content").

**Engine** (`frontend/src/engine/`): a pure state machine — `(save state, content, action) -> (new state, events)`. No Vue, no storage, no clock. `rules.ts` holds every tunable number; `engine.ts` the state transitions and save migration; `diagram.ts` the living-map state; `review.ts` the spaced-repetition ladder; `skills.ts` the per-domain trees. Pinia stores (`src/stores/`) wrap the engine and own persistence; components never hold game rules. `localStorage` is the primary save home (the game needs no account); server sync is optional.

**Backend** (`backend/`): Django 5 + Django Ninja, the whole API in `backend/api.py` (auth, save sync, telemetry events, feedback). `config/urls.py` serves the SPA as a catch-all; in production the host's static mappings answer `/assets/`, `/content/` and `/static/` before Django sees them. `/admin` is the support/QA surface. The project collects no email addresses, so use `python manage.py create_admin --username x` (not `createsuperuser`), and `--player` for the manual password-reset the privacy page promises.

## Invariants that are easy to break

- **Diagram ids are save-state keys.** Player saves store living-map state keyed by node/edge id, so ids in `content/diagrams/act{1,2}.yaml` are permanent once shipped. Ids are deliberately decoupled from labels (`id: st-pod` / `label: stveymarkpod`; historic ids like `mg-meridian`, `kv-meridian` keep their old names after the company rename). Rename the label, never the id — or add a key migration in `migrateSave` (`engine.ts`) if an id genuinely must change. The same applies to quest and encounter ids, which key progress.
- **A node only renders when `present`.** The map shows a node if the save says `present: true`, which happens either from `present: true` in the diagram registry (exists on day one) or an `add_node` op in some quest's fix. A node declared but never marked present anywhere is silently invisible — the linter does not catch this, only that op ids exist.
- **`migrateSave` merges saves key-by-key and the save always wins.** New content nodes fold in with their defaults; anything the player already touched is untouched. Content changes should be additive from an existing player's point of view.
- **Vue Flow quirks** (`LivingMap.vue`, `MapNode.vue`): nodes are non-draggable/non-selectable, so Vue Flow writes `pointer-events: none` and `z-index: 0` inline on every node wrapper. Interactive behavior inside a node needs `pointer-events-auto`, and anything that must paint above neighbours needs an `!important` z-index override.
- **The fictional company is Veymark Logistics** — a checked, invented name. Do not reintroduce real company names into content, and keep the footer/terms disclaimer intact.

## Environment

- Deploy target is PythonAnywhere via the CI `deploy` job in `.github/workflows/ci.yml` (curl-based; it does not use GitHub Environments). `deploy/` holds the WSGI entry point and host-side scripts; DEPLOYMENT.md explains the trigger and recovery.
- Backend needs Python 3.13; settings modules are `config.settings.{dev,test,prod}` (pytest and the content commands use `test`).
