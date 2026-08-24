import json

from django.contrib import admin
from django.utils.html import format_html

from .models import SaveGame


@admin.register(SaveGame)
class SaveGameAdmin(admin.ModelAdmin):
    list_display = ("user", "reputation", "position", "schema_version", "client_updated_at")
    search_fields = ("user__username",)
    readonly_fields = ("created_at", "updated_at", "pretty_blob")
    exclude = ("blob",)

    @admin.display(description="save contents")
    def pretty_blob(self, obj):
        return format_html("<pre style='max-height:32rem;overflow:auto'>{}</pre>",
                           json.dumps(obj.blob, indent=2, sort_keys=True))

    def has_add_permission(self, request):
        return False
