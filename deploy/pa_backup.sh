#!/bin/bash
# Weekly database backup, run as a PythonAnywhere scheduled task:
#
#     bash /home/manuelfdng/the-runbook/deploy/pa_backup.sh
#
# Dumps the MySQL database to ~/backups and keeps the last eight files. There
# are no scheduled jobs in the game itself; this is the only one.

set -uo pipefail

HOME_DIR="${HOME:-/home/manuelfdng}"
BACKUP_DIR="${HOME_DIR}/backups"
KEEP=8

set -a
# shellcheck disable=SC1090
[ -f "${HOME_DIR}/.runbook.env" ] && . "${HOME_DIR}/.runbook.env"
set +a

mkdir -p "${BACKUP_DIR}"
STAMP="$(date -u +%Y%m%d-%H%M)"
TARGET="${BACKUP_DIR}/runbook-${STAMP}.sql.gz"

if [ -z "${MYSQL_NAME:-}" ]; then
    echo "MYSQL_NAME is not set; is ~/.runbook.env in place?" >&2
    exit 1
fi

mysqldump --single-transaction --no-tablespaces \
    -h "${MYSQL_HOST}" -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_NAME}" \
    | gzip > "${TARGET}" || { echo "backup failed" >&2; rm -f "${TARGET}"; exit 1; }

echo "wrote ${TARGET} ($(du -h "${TARGET}" | cut -f1))"

# Keep the most recent few and drop the rest.
ls -1t "${BACKUP_DIR}"/runbook-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "${old}" && echo "removed ${old}"
done
