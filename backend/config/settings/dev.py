from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = True
ALLOWED_HOSTS = ["*"]

# In development the SPA is served by Vite on :5173 and proxies /api to Django
# on :8000, so requests arrive with a cross-origin Origin header and Django's
# CSRF check rejects them. Production serves both from one origin and needs no
# equivalent.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}
