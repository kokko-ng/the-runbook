"""WSGI entry point for the PythonAnywhere web app.

Point the web app's WSGI configuration file at this module's `application`, or
copy its contents into /var/www/<domain>_wsgi.py.

Static files are served by WhiteNoise inside this process, so the web app needs
no static file mappings.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
