from django.contrib import admin
from django.urls import path, re_path
from django.views.generic import TemplateView

from api import api

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    # History-mode SPA: everything that is not API, admin, or a static mapping
    # falls through to the Vue index.html.
    re_path(
        r"^(?!api/|admin/|static/|assets/).*$",
        TemplateView.as_view(template_name="index.html"),
        name="spa",
    ),
]
