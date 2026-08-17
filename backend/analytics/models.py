from django.conf import settings
from django.db import models


class AnalyticsEvent(models.Model):
    anonymous_id = models.CharField(max_length=64, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    type = models.CharField(max_length=64)
    encounter_id = models.CharField(max_length=128, blank=True, default="")
    outcome = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["type", "created_at"])]

    def __str__(self):
        return f"{self.type} {self.encounter_id} {self.outcome}".strip()
