from django.contrib import admin

from .models import AnalyticsEvent


@admin.register(AnalyticsEvent)
class AnalyticsEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "type", "quest_id", "encounter_id", "outcome", "who")
    list_filter = ("type", "outcome", "created_at")
    search_fields = ("quest_id", "encounter_id", "anonymous_id", "user__username")
    date_hierarchy = "created_at"
    readonly_fields = tuple(f.name for f in AnalyticsEvent._meta.fields)

    @admin.display(description="who")
    def who(self, obj):
        return obj.user.username if obj.user else f"anon:{obj.anonymous_id[:8]}"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
