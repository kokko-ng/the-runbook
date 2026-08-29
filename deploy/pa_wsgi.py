"""WSGI entry point for the PythonAnywhere web app.

The web app's WSGI configuration file (in /var/www) imports `application` from
here. Two jobs:

1. Put the backend on the path, load the environment file, and hand back the
   Django application.
2. Act as the deploy trigger. CI has no shell on PythonAnywhere, but it does
   have the Files API and the reload endpoint, so a deploy is: upload the build
   and a request file, then reload. The first worker to start after that reload
   claims the request and spawns the deploy script in the background.

Claiming is an atomic rename, so only one worker ever runs a given deploy even
though several start at once, and the reload the script triggers at the end does
not start a second round.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

HOME = Path(os.environ.get("HOME", "/home/manuelfdng"))
REPO = HOME / "the-runbook"
BACKEND = REPO / "backend"
ENV_FILE = HOME / ".runbook.env"
REQUEST = HOME / "incoming" / "deploy_request.json"
STATUS_DIR = HOME / "deploy_status"


def _load_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export ") :].strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def _claim_pending_deploy() -> None:
    """Start a deploy if CI has asked for one. Never let this break the app."""
    try:
        if not REQUEST.exists():
            return
        STATUS_DIR.mkdir(parents=True, exist_ok=True)
        request = json.loads(REQUEST.read_text(encoding="utf-8"))
        sha = str(request.get("sha", "main"))[:64]
        claim = STATUS_DIR / f"{sha}.claimed"
        # rename is atomic on the same filesystem, so exactly one worker wins.
        REQUEST.rename(claim)
        subprocess.Popen(
            ["bash", str(REPO / "deploy" / "pa_deploy.sh"), sha],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except FileNotFoundError:
        pass
    except Exception as error:  # pragma: no cover - defensive
        print(f"deploy trigger skipped: {error!r}", file=sys.stderr)


if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

_load_env()
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
_claim_pending_deploy()

# Imported here rather than at the top of the file on purpose: Django reads
# DJANGO_SETTINGS_MODULE at import time, and the lines above are what set it.
from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
