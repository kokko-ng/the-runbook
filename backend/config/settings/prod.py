import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = False
ALLOWED_HOSTS = os.environ["DJANGO_ALLOWED_HOSTS"].split(",")

# MySQL is the intended production database. SQLite is selectable only by
# setting DB_ENGINE explicitly, so a missing MySQL password fails loudly at
# startup rather than quietly running production on a file.
DB_ENGINE = os.environ.get("DB_ENGINE", "mysql")

if DB_ENGINE == "mysql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ["MYSQL_NAME"],
            "USER": os.environ["MYSQL_USER"],
            "PASSWORD": os.environ["MYSQL_PASSWORD"],
            "HOST": os.environ["MYSQL_HOST"],
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
            # PythonAnywhere closes idle MySQL connections; do not persist them.
            "CONN_MAX_AGE": 0,
        }
    }
elif DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("SQLITE_PATH", str(BASE_DIR / "db.sqlite3")),
        }
    }
else:
    raise ImproperlyConfigured(f"DB_ENGINE must be 'mysql' or 'sqlite', got {DB_ENGINE!r}")

CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in ALLOWED_HOSTS]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Password-reset email ships via SendGrid once SENDGRID_API_KEY is configured;
# until then the console backend from base.py stays in effect.
if os.environ.get("SENDGRID_API_KEY"):
    EMAIL_BACKEND = "anymail.backends.sendgrid.EmailBackend"
    ANYMAIL = {"SENDGRID_API_KEY": os.environ["SENDGRID_API_KEY"]}
