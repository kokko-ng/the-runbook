import os
from pathlib import Path

# backend/config/settings/base.py -> backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
REPO_DIR = BASE_DIR.parent
CONTENT_DIR = REPO_DIR / "content"
FRONTEND_DIST = REPO_DIR / "frontend" / "dist"

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = False
ALLOWED_HOSTS: list[str] = []

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "accounts",
    "analytics",
    "content_pipeline",
    "saves",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves the Vue build and Django admin assets straight from the
    # WSGI process, so the deployment needs no host-level static file mappings.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # The Vue build supplies index.html; BASE_DIR/templates supplies the
        # password-reset email bodies.
        "DIRS": [FRONTEND_DIST, BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# The Vue build is collected alongside Django's own static files. Vite is
# configured with base '/static/' so the hashed asset URLs line up.
# Prefixed so the build lands at staticfiles/assets/, matching the /static/assets/
# URLs Vite emits. Vite already fingerprints filenames, so the plain compressed
# storage is right here - the manifest variant would try to rewrite them again.
STATICFILES_DIRS = []
if (FRONTEND_DIST / "assets").is_dir():
    STATICFILES_DIRS.append(("assets", FRONTEND_DIST / "assets"))
if (REPO_DIR / "frontend" / "public").is_dir():
    # Vite rewrites index.html's favicon reference to /static/, so the public
    # files need collecting too; WHITENOISE_ROOT separately keeps /robots.txt
    # answering at the site root where crawlers look for it.
    STATICFILES_DIRS.append(REPO_DIR / "frontend" / "public")

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Serves the build's root files (favicon, robots.txt) at the site root, where
# crawlers and browsers expect them, rather than under /static/.
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.is_dir() else None
WHITENOISE_INDEX_FILE = False

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@localhost")
