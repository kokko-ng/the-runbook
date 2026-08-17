# The Runbook

A text-based RPG that teaches Azure AZ-104 and AZ-305 through a realistic IT career.
You join Meridian Logistics as a junior cloud admin, survive tickets, outages, and
design reviews, and climb to solutions architect. Fully authored, deterministic
content; every player input is a multiple-choice selection. The entire game is free.

The Runbook is an independent study aid. It is not affiliated with, endorsed by, or
sponsored by Microsoft. AZ-104, AZ-305, Azure, and Microsoft are trademarks of the
Microsoft group of companies.

## Layout

| Path | Contents |
|---|---|
| `content/` | Quest YAML, exam objective registries, base architecture diagrams, JSON Schemas |
| `backend/` | Django 5 + Django Ninja API, content validator/compiler (`validate_content`, `compile_content`) |
| `frontend/` | Vue 3 SPA: pure TypeScript game engine, Pinia stores, Tailwind UI, vue-flow living map |
| `deploy/` | PythonAnywhere deploy script and WSGI shim |

## Development

```bash
# Backend (Python via uv)
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver          # http://localhost:8000

# Content: validate and compile
uv run python manage.py validate_content --matrix
uv run python manage.py compile_content

# Frontend (Node 24)
cd frontend
npm install
npm run dev                                # http://localhost:5173 (compiles content first)

# Tests
cd backend && uv run pytest
cd frontend && npm test
```

## Content pipeline

Quests live in `content/quests/` as YAML, one file per quest, validated against the
JSON Schemas in `content/schema/` plus semantic lint rules (exactly one correct
option, no dead ends, diagram op targets exist, every exam objective mapped).
`compile_content` emits per-quest JSON into `frontend/src/generated/content/`, which
the SPA code-splits and ships in the bundle. CI fails if any current exam objective
is unmapped.

## Deployment

GitHub Actions CI runs the content linter, backend tests, and the frontend
production build on every push and PR. Merges to `main` deploy to PythonAnywhere
(standard WSGI web app; Vue build served through static file mappings, API under
`/api`).
