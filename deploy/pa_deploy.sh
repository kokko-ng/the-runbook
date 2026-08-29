#!/bin/bash
# Deploy The Runbook on PythonAnywhere.
#
# Runs on PythonAnywhere itself. Started either by the WSGI deploy trigger (see
# pa_wsgi.py) or by hand from a Bash console:
#
#     bash ~/the-runbook/deploy/pa_deploy.sh <git-sha>
#
# The frontend is built in CI and arrives as ~/incoming/dist.tar.gz, because
# PythonAnywhere has no Node toolchain. If that tarball is missing the script
# keeps whatever build is already in place, so a backend-only run is safe.
#
# Progress lands in ~/deploy_status/<sha>.log and finishes as .done or .failed,
# which is what CI polls for through the Files API.

set -uo pipefail

SHA="${1:-main}"
HOME_DIR="${HOME:-/home/manuelfdng}"
REPO="${HOME_DIR}/the-runbook"
VENV="${HOME_DIR}/.virtualenvs/runbook"
INCOMING="${HOME_DIR}/incoming/dist.tar.gz"
STATUS_DIR="${HOME_DIR}/deploy_status"
LOG="${STATUS_DIR}/${SHA}.log"
WSGI_FILE="${WSGI_FILE:-/var/www/manuelfdng_pythonanywhere_com_wsgi.py}"

mkdir -p "${STATUS_DIR}" "${HOME_DIR}/incoming"
: > "${LOG}"
rm -f "${STATUS_DIR}/${SHA}.done" "${STATUS_DIR}/${SHA}.failed"

log() { echo "[$(date -u +%H:%M:%S)] $*" >> "${LOG}"; }

fail() {
    log "FAILED: $*"
    # Reload anyway. The game itself needs no database, so serving the new build
    # beats leaving stale workers up while somebody fixes the failure. CI still
    # reports the deploy as failed.
    if [ -f "${WSGI_FILE}" ]; then
        touch "${WSGI_FILE}" && log "reloaded despite the failure, so the current build is live"
    fi
    tail -60 "${LOG}" > "${STATUS_DIR}/${SHA}.failed"
    exit 1
}

run() {
    log "\$ $*"
    if ! "$@" >> "${LOG}" 2>&1; then
        fail "$1 exited non-zero"
    fi
}

log "deploying ${SHA}"

# --- source -------------------------------------------------------------
# CI ships the exact commit as a tarball, so the deploy needs no credentials on
# this machine and no network access to GitHub. A git checkout, when there is a
# working one, is preferred because it keeps rollback a one-liner.
SOURCE_TAR="${HOME_DIR}/incoming/source.tar.gz"
mkdir -p "${REPO}"

if [ -d "${REPO}/.git" ] && git -C "${REPO}" fetch --prune origin >> "${LOG}" 2>&1; then
    cd "${REPO}" || fail "cannot enter ${REPO}"
    if [ "${SHA}" = "main" ]; then
        run git reset --hard origin/main
    else
        run git reset --hard "${SHA}"
    fi
    log "source from git, now at $(git rev-parse --short HEAD)"
    rm -f "${SOURCE_TAR}"
elif [ -f "${SOURCE_TAR}" ]; then
    log "no usable git remote; unpacking the source CI uploaded"
    # These directories are replaced wholesale, so clear them first and no stale
    # file survives a deploy. frontend/ is left alone because dist lives in it.
    rm -rf "${REPO}/backend" "${REPO}/content" "${REPO}/deploy" "${REPO}/.github"
    run tar -xzf "${SOURCE_TAR}" -C "${REPO}"
    rm -f "${SOURCE_TAR}"
    echo "${SHA}" > "${REPO}/DEPLOYED_SHA"
    log "source from tarball at ${SHA}"
    cd "${REPO}" || fail "cannot enter ${REPO}"
else
    fail "no git remote and no source tarball; nothing to deploy"
fi

# --- python environment -------------------------------------------------
if [ ! -x "${VENV}/bin/python" ]; then
    log "creating the virtualenv"
    run python3.13 -m venv "${VENV}"
fi
run "${VENV}/bin/pip" install --quiet --upgrade pip
run "${VENV}/bin/pip" install --quiet \
    "django>=5.2,<6.0" \
    "django-ninja>=1.4" \
    "pyyaml>=6.0" \
    "jsonschema>=4.23" \
    "mysqlclient>=2.2"

# --- environment --------------------------------------------------------
set -a
# The env file is written by hand on the host and is deliberately not in git,
# so there is nothing here for shellcheck to read and follow.
# shellcheck source=/dev/null
[ -f "${HOME_DIR}/.runbook.env" ] && . "${HOME_DIR}/.runbook.env"
set +a
export DJANGO_SETTINGS_MODULE=config.settings.prod

# --- frontend build -----------------------------------------------------
cd "${REPO}/backend" || fail "cannot enter backend"
if [ -f "${INCOMING}" ]; then
    log "unpacking the frontend build"
    rm -rf "${REPO}/frontend/dist"
    mkdir -p "${REPO}/frontend/dist"
    run tar -xzf "${INCOMING}" -C "${REPO}/frontend/dist"
    rm -f "${INCOMING}"
else
    log "no incoming build; keeping the one already in place"
fi

# --- django -------------------------------------------------------------
run "${VENV}/bin/python" manage.py validate_content
# One-shot: the production database still carries a superseded build's schema.
# The marker file is created by hand, used once, and deleted here.
if [ -f "${HOME_DIR}/RESET_DB_ONCE" ]; then
    log "database reset requested; taking a dump first"
    bash "${REPO}/deploy/pa_backup.sh" >> "${LOG}" 2>&1 || log "backup failed; continuing anyway"
    run "${VENV}/bin/python" manage.py reset_database --yes
    rm -f "${HOME_DIR}/RESET_DB_ONCE"
    log "marker removed; this will not happen again"
fi

run "${VENV}/bin/python" manage.py migrate --noinput
run "${VENV}/bin/python" manage.py collectstatic --noinput

# --- reload -------------------------------------------------------------
if [ -f "${WSGI_FILE}" ]; then
    touch "${WSGI_FILE}" && log "touched ${WSGI_FILE} to reload the web app"
else
    log "no WSGI file at ${WSGI_FILE}; skipping the reload touch"
fi

log "done"
cp "${LOG}" "${STATUS_DIR}/${SHA}.done"
