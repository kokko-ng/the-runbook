#!/bin/bash
# Deploy The Runbook on PythonAnywhere.
#
# Runs on PythonAnywhere itself, driven either by the GitHub Actions deploy
# workflow or by hand from a Bash console:
#
#     bash ~/the-runbook/deploy/pa_deploy.sh [git-sha]
#
# The frontend is built in CI and shipped as ~/incoming/dist.tar.gz, because
# PythonAnywhere has no Node toolchain. When that tarball is absent the script
# keeps whatever build is already in place, so a backend-only deploy is safe.
#
# Progress is written to ~/deploy_status/<sha>.done or .failed so the caller can
# poll for the outcome through the Files API.

set -euo pipefail

SHA="${1:-main}"
REPO="${HOME}/the-runbook"
VENV="${HOME}/.virtualenvs/runbook"
INCOMING="${HOME}/incoming/dist.tar.gz"
STATUS_DIR="${HOME}/deploy_status"
LOG="${HOME}/deploy_status/${SHA}.log"

mkdir -p "${STATUS_DIR}"
: > "${LOG}"
rm -f "${STATUS_DIR}/${SHA}.done" "${STATUS_DIR}/${SHA}.failed"

fail() {
    echo "FAILED: $1" >> "${LOG}"
    tail -40 "${LOG}" > "${STATUS_DIR}/${SHA}.failed"
    exit 1
}

log() {
    echo "[$(date -u +%H:%M:%S)] $1" >> "${LOG}"
}

trap 'fail "unexpected error on line ${LINENO}"' ERR

log "deploying ${SHA}"

# --- source ---------------------------------------------------------------
if [ -d "${REPO}/.git" ]; then
    cd "${REPO}"
    git fetch --all --quiet >> "${LOG}" 2>&1
    if [ "${SHA}" = "main" ]; then
        git reset --hard origin/main >> "${LOG}" 2>&1
    else
        git reset --hard "${SHA}" >> "${LOG}" 2>&1
    fi
    log "source at $(git rev-parse --short HEAD)"
else
    log "no git checkout at ${REPO}; using the files already there"
fi

# --- python environment ---------------------------------------------------
if [ ! -x "${VENV}/bin/python" ]; then
    log "creating virtualenv"
    python3.13 -m venv "${VENV}" >> "${LOG}" 2>&1
fi

log "installing dependencies"
"${VENV}/bin/pip" install --quiet --upgrade pip >> "${LOG}" 2>&1
"${VENV}/bin/pip" install --quiet \
    "django>=5.2,<6.0" \
    "django-ninja>=1.3" \
    "pyyaml>=6.0" \
    "jsonschema>=4.23" \
    "whitenoise>=6.12" \
    "mysqlclient>=2.2" \
    "django-anymail[sendgrid]>=11.0" >> "${LOG}" 2>&1

# --- frontend build -------------------------------------------------------
if [ -f "${INCOMING}" ]; then
    log "unpacking the frontend build"
    rm -rf "${REPO}/frontend/dist"
    mkdir -p "${REPO}/frontend/dist"
    tar -xzf "${INCOMING}" -C "${REPO}/frontend/dist" >> "${LOG}" 2>&1
    rm -f "${INCOMING}"
else
    log "no incoming build; keeping the existing one"
fi

# --- django ---------------------------------------------------------------
cd "${REPO}/backend"
set -a
# shellcheck disable=SC1091
[ -f "${HOME}/.runbook.env" ] && . "${HOME}/.runbook.env"
set +a
export DJANGO_SETTINGS_MODULE=config.settings.prod

log "running migrations"
"${VENV}/bin/python" manage.py migrate --noinput >> "${LOG}" 2>&1

log "collecting static files"
"${VENV}/bin/python" manage.py collectstatic --noinput --clear >> "${LOG}" 2>&1

log "validating content"
"${VENV}/bin/python" manage.py validate_content >> "${LOG}" 2>&1

trap - ERR
log "done"
cp "${LOG}" "${STATUS_DIR}/${SHA}.done"
echo "deploy of ${SHA} finished"
