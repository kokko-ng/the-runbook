#!/bin/bash
# Weekly database backup for The Runbook.
#
# PythonAnywhere schedules tasks daily or hourly, not weekly, so this runs daily
# and does the work on one chosen weekday. Backups are kept for eight weeks and
# older ones are pruned, so the directory cannot grow without limit.
#
# Install as a daily scheduled task:
#     bash /home/USER/the-runbook/deploy/pa_backup.sh

set -uo pipefail

BACKUP_DAY="${BACKUP_DAY:-7}"   # ISO weekday: 1 Monday .. 7 Sunday
KEEP_WEEKS=8
BACKUP_DIR="${HOME}/backups"
STAMP="$(date -u +%Y-%m-%d)"

if [ "$(date -u +%u)" != "${BACKUP_DAY}" ]; then
    exit 0
fi

mkdir -p "${BACKUP_DIR}"

set -a
# shellcheck disable=SC1091
[ -f "${HOME}/.runbook.env" ] && . "${HOME}/.runbook.env"
set +a

if [ "${DB_ENGINE:-mysql}" = "sqlite" ]; then
    src="${SQLITE_PATH:-${HOME}/runbook-db.sqlite3}"
    if [ ! -f "${src}" ]; then
        echo "no database at ${src}; nothing to back up"
        exit 0
    fi
    # .backup takes a consistent copy even while the web app is serving.
    sqlite3 "${src}" ".backup '${BACKUP_DIR}/runbook-${STAMP}.sqlite3'"
    gzip -f "${BACKUP_DIR}/runbook-${STAMP}.sqlite3"
else
    mysqldump \
        --user="${MYSQL_USER}" \
        --password="${MYSQL_PASSWORD}" \
        --host="${MYSQL_HOST}" \
        --single-transaction \
        --quick \
        "${MYSQL_NAME}" | gzip > "${BACKUP_DIR}/runbook-${STAMP}.sql.gz"
fi

# Prune anything older than the retention window.
find "${BACKUP_DIR}" -name 'runbook-*' -type f -mtime "+$((KEEP_WEEKS * 7))" -delete

echo "backup written for ${STAMP}"
ls -la "${BACKUP_DIR}"
