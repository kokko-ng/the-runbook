import json

from django.contrib import admin
from django.utils.html import format_html

from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("created_at", "category", "summary", "quest_id", "route", "who", "handled")
    list_filter = ("handled", "category", "created_at")
    search_fields = ("message", "quest_id", "encounter_id", "route", "user__username", "anonymous_id")
    date_hierarchy = "created_at"
    list_editable = ("handled",)
    actions = ["mark_handled", "mark_unhandled"]
    readonly_fields = (
        "created_at",
        "category",
        "message",
        "route",
        "quest_id",
        "encounter_id",
        "content_version",
        "anonymous_id",
        "user",
        "pretty_context",
    )
    exclude = ("context",)

    @admin.display(description="who")
    def who(self, obj):
        return obj.user.username if obj.user else f"anon:{obj.anonymous_id[:8]}"

    @admin.display(description="where they were")
    def pretty_context(self, obj):
        return format_html(
            "<pre style='max-height:28rem;overflow:auto'>{}</pre>",
            json.dumps(obj.context, indent=2, sort_keys=True),
        )

    @admin.action(description="Mark selected feedback as handled")
    def mark_handled(self, request, queryset):
        self.message_user(request, f"{queryset.update(handled=True)} marked handled.")

    @admin.action(description="Mark selected feedback as not handled")
    def mark_unhandled(self, request, queryset):
        self.message_user(request, f"{queryset.update(handled=False)} reopened.")

    def has_add_permission(self, request):
        return False
