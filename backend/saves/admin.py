import json

from django.contrib import admin
from django.utils.html import format_html

from .models import SaveGame


@admin.register(SaveGame)
class SaveGameAdmin(admin.ModelAdmin):
    """Read-only support view. Saves are player data; the back office looks,
    it does not edit."""

    list_display = ["user", "schema_version", "position", "reputation", "updated_at"]
    list_filter = ["schema_version", "updated_at"]
    search_fields = ["user__email"]
    readonly_fields = ["user", "schema_version", "updated_at", "synced_at", "blob_pretty"]
    exclude = ["blob"]
    date_hierarchy = "updated_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description="Position")
    def position(self, obj):
        state = obj.blob.get("state", {}) if isinstance(obj.blob, dict) else {}
        quest = state.get("questId") or "not started"
        encounter = state.get("encounterId") or ""
        return f"{quest} {encounter}".strip()

    @admin.display(description="Standing")
    def reputation(self, obj):
        state = obj.blob.get("state", {}) if isinstance(obj.blob, dict) else {}
        return state.get("rep", "-")

    @admin.display(description="Save blob")
    def blob_pretty(self, obj):
        return format_html(
            "<pre style='max-height:32rem;overflow:auto'>{}</pre>",
            json.dumps(obj.blob, indent=2, sort_keys=True),
        )
