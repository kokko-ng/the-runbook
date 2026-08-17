from django.contrib import admin

from .models import AnalyticsEvent


@admin.register(AnalyticsEvent)
class AnalyticsEventAdmin(admin.ModelAdmin):
    list_display = ["type", "encounter_id", "outcome", "anonymous_id", "user", "created_at"]
    list_filter = ["type", "outcome", "created_at"]
    search_fields = ["encounter_id", "anonymous_id"]
    date_hierarchy = "created_at"
