import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = False

if "DJANGO_ALLOWED_HOSTS" not in os.environ:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set in production.")
ALLOWED_HOSTS = [h.strip() for h in os.environ["DJANGO_ALLOWED_HOSTS"].split(",") if h.strip()]

if os.environ.get("DJANGO_SECRET_KEY") in (None, "", "insecure-dev-key-not-for-production"):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a real value in production.")

# MySQL is the intended production database. SQLite has to be asked for by name,
# so a missing MySQL password fails at startup rather than quietly running the
# live site off a file that the next deploy overwrites.
DB_ENGINE = os.environ.get("DB_ENGINE", "mysql")

if DB_ENGINE == "mysql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ["MYSQL_NAME"],
            "USER": os.environ["MYSQL_USER"],
            "PASSWORD": os.environ["MYSQL_PASSWORD"],
            "HOST": os.environ["MYSQL_HOST"],
            "PORT": os.environ.get("MYSQL_PORT", ""),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
            # The host drops idle MySQL connections, so do not keep them around.
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

CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS if not host.startswith(".")]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
