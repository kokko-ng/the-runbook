from django.contrib.admin.apps import AdminConfig


class RunbookAdminConfig(AdminConfig):
    """Swaps in the admin site that carries the content QA views."""

    default_site = "config.admin.RunbookAdminSite"
