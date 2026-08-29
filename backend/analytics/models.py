from django.conf import settings
from django.db import models


class AnalyticsEvent(models.Model):
    """Anonymous gameplay telemetry.

    Used to answer one question: which encounters are people getting wrong or
    quitting on. No IP addresses, no user agents, and the anonymous id is a
    random value the browser makes up for itself.
    """

    TYPES = [
        ("quest_start", "Quest started"),
        ("quest_complete", "Quest completed"),
        ("encounter_resolve", "Encounter resolved"),
        ("choice", "Choice made"),
        ("pip", "Reputation hit zero"),
        ("perk_buy", "Perk purchased"),
        ("act_opened", "Act opened without finishing the one before"),
    ]

    anonymous_id = models.CharField(max_length=64, blank=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    type = models.CharField(max_length=40, choices=TYPES, db_index=True)
    quest_id = models.CharField(max_length=64, blank=True, db_index=True)
    encounter_id = models.CharField(max_length=64, blank=True)
    outcome = models.CharField(max_length=40, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "analytics event"
        indexes = [models.Index(fields=["type", "created_at"])]

    def __str__(self) -> str:
        return f"{self.type} {self.quest_id}/{self.encounter_id}"
