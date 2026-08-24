from django.contrib import admin
from django.urls import path, re_path

from api import api
from config.views import csrf_view, dist_file, legal_page, spa_index

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/csrf", csrf_view, name="csrf"),
    path("api/", api.urls),
    # Machine-readable copies of the pages that have to exist even if the SPA
    # never loads.
    re_path(r"^(?P<filename>favicon\.svg|robots\.txt|manifest\.webmanifest)$", dist_file, name="dist_file"),
    path("legal/privacy.txt", legal_page, {"page": "privacy"}, name="privacy_txt"),
    path("legal/terms.txt", legal_page, {"page": "terms"}, name="terms_txt"),
    # Everything else is the single-page app. The host's static file mappings
    # answer /assets/, /content/ and /static/ before the request reaches Django.
    re_path(r"^(?!api/|admin/|static/|assets/|content/|legal/).*$", spa_index, name="spa"),
]
