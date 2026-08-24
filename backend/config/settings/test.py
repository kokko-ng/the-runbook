from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "test.sqlite3"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
