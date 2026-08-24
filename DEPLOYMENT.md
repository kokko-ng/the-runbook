# Deploying The Runbook

Production is a standard WSGI web app on PythonAnywhere with MySQL. Routine
deploys go through GitHub Actions. The PythonAnywhere MCP server is for
provisioning, static file mappings and interactive debugging, not for shipping.

## The shape of it

```
push to main
  -> CI: content lint + coverage, backend tests, frontend build
  -> deploy job:
       compile content  -> frontend/public/content
       npm run build:only -> frontend/dist
       upload dist.tar.gz and source.tar.gz via the PythonAnywhere Files API
       upload deploy_request.json            via the Files API
       POST .../webapps/<domain>/reload/
       poll ~/deploy_status/<sha>.done
```

PythonAnywhere gives CI no shell, so the trigger is the web app itself. On
startup, `deploy/pa_wsgi.py` looks for `~/incoming/deploy_request.json`, claims
it with an atomic rename so only one worker acts, and spawns
`deploy/pa_deploy.sh` in the background. That script takes the commit from git
when the checkout has a working remote and from the uploaded `source.tar.gz`
when it does not, which is what keeps the deploy working without storing
credentials on the host. It then installs dependencies, unpacks the frontend
build, validates content, migrates, collects static files, and touches the WSGI
file to reload. It writes
`~/deploy_status/<sha>.done` or `.failed`, which the workflow polls through the
Files API.

## What lives on PythonAnywhere

| Path | What it is |
| --- | --- |
| `~/the-runbook` | The git checkout. `git reset --hard` territory: never edit here. |
| `~/.virtualenvs/runbook` | Python 3.13 virtualenv for the web app. |
| `~/.runbook.env` | Secrets and settings. Not in git, never printed. |
| `~/incoming/` | Where CI drops `dist.tar.gz` and `deploy_request.json`. |
| `~/deploy_status/` | Deploy logs, one per commit. |
| `~/backups/` | Weekly database dumps, last eight kept. |
| `/var/www/<domain>_wsgi.py` | Two lines, importing `application` from `deploy/pa_wsgi.py`. |

## Environment file

`~/.runbook.env`, read by both the WSGI entry point and the deploy script:

```
DJANGO_SECRET_KEY=<a long random value>
DJANGO_ALLOWED_HOSTS=<domain>
MYSQL_NAME=<user>$runbook
MYSQL_USER=<user>
MYSQL_PASSWORD=<the MySQL password from the PythonAnywhere Databases tab>
MYSQL_HOST=<user>.mysql.pythonanywhere-services.com
```

No mail settings appear here, because the project sends no mail.

## GitHub secrets

Set once, by a human, with the `gh` CLI:

```bash
gh secret set PYTHONANYWHERE_USERNAME  -R kokko-ng/the-runbook
gh secret set PYTHONANYWHERE_DOMAIN    -R kokko-ng/the-runbook
gh secret set PYTHONANYWHERE_API_TOKEN -R kokko-ng/the-runbook
```

The API token comes from the PythonAnywhere account page. Accounts on the EU
host also need `gh variable set PYTHONANYWHERE_HOST -b eu.pythonanywhere.com`.

## Static files

The web app's static file mappings serve the heavy assets straight off disk, so
Django only ever hands out `index.html` for SPA routes:

| URL | Directory |
| --- | --- |
| `/assets/` | `/home/<user>/the-runbook/frontend/dist/assets` |
| `/content/` | `/home/<user>/the-runbook/frontend/dist/content` |
| `/static/` | `/home/<user>/the-runbook/backend/staticfiles` |

Force HTTPS is on. Everything else falls through to Django, which serves the API
under `/api` and the single-page app everywhere else.

## Deploying by hand

If the pipeline is unavailable, from a PythonAnywhere Bash console:

```bash
bash ~/the-runbook/deploy/pa_deploy.sh main
tail -f ~/deploy_status/main.log
```

Without a `dist.tar.gz` in `~/incoming`, the frontend build already in place is
left alone, which makes a backend-only deploy safe.

## Backups

One scheduled task, weekly:

```
bash /home/<user>/the-runbook/deploy/pa_backup.sh
```

It writes a gzipped dump to `~/backups` and keeps the last eight. There are no
other scheduled jobs.

## When a deploy fails

1. Read `~/deploy_status/<sha>.failed`, which holds the tail of the log.
2. `~/deploy_status/<sha>.log` has the whole run.
3. The web app's error log on the PythonAnywhere Web tab covers anything that
   broke after the reload.
4. To roll back: `cd ~/the-runbook && git reset --hard <previous-sha>` then
   `bash deploy/pa_deploy.sh <previous-sha>`. The frontend build in
   `frontend/dist` belongs to the newer commit, so re-run the deploy job for the
   older commit from GitHub Actions if the two have drifted apart.
