#!/bin/bash
# Pull-based deploy trigger for PythonAnywhere.
#
# Runs as an hourly scheduled task. The CD pipeline cannot start a process on
# PythonAnywhere directly - the API can create a console but not run one
# unattended - so instead it uploads a request marker through the Files API and
# this task picks it up.
#
#     Actions:  build -> upload dist.tar.gz -> upload deploy_request/<sha>
#     Here:     see a request -> run pa_deploy.sh <sha> -> write deploy_status/<sha>.done
#     Actions:  poll for the status file -> reload the web app -> smoke test
#
# When PYTHONANYWHERE_CONSOLE_ID is configured the pipeline also pokes a console
# so the deploy starts immediately; this task is then the fallback that keeps
# deploys working when that console has died.

set -uo pipefail

REQUEST_DIR="${HOME}/deploy_request"
STATUS_DIR="${HOME}/deploy_status"
REPO="${HOME}/the-runbook"

mkdir -p "${REQUEST_DIR}" "${STATUS_DIR}"

# Oldest request first, so a queue drains in the order it arrived.
request="$(ls -1tr "${REQUEST_DIR}" 2>/dev/null | head -1)"
if [ -z "${request}" ]; then
    exit 0
fi

sha="${request}"
echo "$(date -u +%FT%TZ) picked up deploy request ${sha}"

# Remove the request before running, so a deploy that dies mid-way is not
# retried forever on every subsequent hour.
rm -f "${REQUEST_DIR}/${request}"

bash "${REPO}/deploy/pa_deploy.sh" "${sha}"
