# Deploying The Runbook

The pipeline builds on GitHub Actions and ships to PythonAnywhere. Everything
here is already configured except the three human steps in the next section.

## What still needs a human

PythonAnywhere's API cannot do these, so they are done once by hand.

### 1. The Actions deploy secret

The deploy workflow authenticates to PythonAnywhere with an API token. Take it
from **pythonanywhere.com → Account → API token**, then:

```bash
gh secret set PYTHONANYWHERE_API_TOKEN     # prompts; the value is never echoed
```

`PYTHONANYWHERE_USERNAME` and `PYTHONANYWHERE_DOMAIN` are already set. The
optional `PYTHONANYWHERE_CONSOLE_ID` is covered under "How a deploy runs" below.

### 2. MySQL

Production currently runs on SQLite so the site can serve while the database is
being set up. MySQL databases cannot be created through the API.

1. On the PythonAnywhere **Databases** tab, set a MySQL password and create a
   database named `therunbook`. Its full name will be `<username>$therunbook`.
2. In `~/.runbook.env` on PythonAnywhere, put that password in `MYSQL_PASSWORD`
   and change `DB_ENGINE` from `sqlite` to `mysql`.
3. Reload the web app. The next deploy runs `migrate` against MySQL.

Nothing in the application changes: `backend/config/settings/prod.py` selects the
backend from `DB_ENGINE` and fails loudly rather than silently falling back.

### 3. Password-reset email

Password reset is built and tested but sends through Django's console backend
until a provider is configured, so reset emails are written to the server log
rather than delivered.

Put a SendGrid API key in `SENDGRID_API_KEY` in `~/.runbook.env` and reload.
`prod.py` switches to django-anymail's SendGrid backend when that variable is
non-empty. Everything else about accounts works without it.

## How a deploy runs

Merges to `main` trigger `.github/workflows/deploy.yml`:

1. Validate content, run backend and engine tests, build the frontend.
2. Upload `dist.tar.gz` to `~/incoming/` through the PythonAnywhere Files API.
   PythonAnywhere has no Node toolchain, so the bundle is built in CI and
   shipped rather than rebuilt on the host.
3. Upload a request marker to `~/deploy_request/<sha>`.
4. An hourly scheduled task on PythonAnywhere runs `deploy/pa_poll.sh`, which
   picks up the marker and runs `deploy/pa_deploy.sh`: git reset to the commit,
   install dependencies, unpack the bundle, migrate, collectstatic, validate
   content, then write `~/deploy_status/<sha>.done`.
5. Actions polls for that status file, reloads the web app, and smoke-tests
   `/api/health` and the home page.

The pull-based trigger exists because the PythonAnywhere API can create a
console but cannot run one unattended. To make deploys immediate instead of
waiting for the top of the hour, open a Bash console on PythonAnywhere, leave it
running, and store its id:

```bash
gh secret set PYTHONANYWHERE_CONSOLE_ID --body "<console id from the console URL>"
```

The pipeline then pokes that console as well. If the console dies, deploys keep
working through the hourly task, just more slowly.

## Static files

There are no PythonAnywhere static file mappings and none are needed. WhiteNoise
serves the Vue build and Django's admin assets from inside the WSGI process, so
the same code path serves assets locally, in CI, and in production. Vite builds
with `base: '/static/'`; `collectstatic` gathers `frontend/dist/assets` into
`backend/staticfiles`; `WHITENOISE_ROOT` serves `favicon.svg` and `robots.txt`
from the site root.

## Scheduled tasks

| Task | Interval | Purpose |
|---|---|---|
| `deploy/pa_poll.sh` | hourly | Picks up deploy requests from the pipeline |
| `deploy/pa_backup.sh` | daily | Backs up the database on one weekday, keeps eight weeks |

`pa_backup.sh` runs daily because PythonAnywhere offers daily or hourly but not
weekly; it exits immediately on the other six days. It handles both SQLite and
MySQL, so it keeps working across the database switch above.

## Running it locally

```bash
cd backend  && uv sync && uv run python manage.py migrate
cd frontend && npm install
```

Two processes:

```bash
cd backend  && uv run python manage.py runserver   # :8000, serves /api
cd frontend && npm run dev                         # :5173, proxies /api to :8000
```

`npm run dev` compiles the content tree first. Because the dev server is a
different origin from Django, `config/settings/dev.py` trusts `localhost:5173`
for CSRF; production is same-origin and needs no equivalent.

## Rolling back

Deploys are a `git reset --hard` to a commit, so a rollback is a revert commit
on `main`, or a manual run of the deploy script on PythonAnywhere naming an
older sha:

```bash
bash ~/the-runbook/deploy/pa_deploy.sh <older-sha>
```

Then reload the web app.
