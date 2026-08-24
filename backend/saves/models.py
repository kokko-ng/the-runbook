from django.conf import settings
from django.db import models


class SaveGame(models.Model):
    """One server-side save per account.

    The blob is the same JSON the browser keeps in localStorage. The server does
    not interpret it: the engine that understands it lives in the frontend, and
    keeping the server ignorant means a content or engine change never needs a
    migration here.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="savegame"
    )
    schema_version = models.PositiveIntegerField(default=1)
    blob = models.JSONField(default=dict)
    client_updated_at = models.DateTimeField(
        help_text="When the browser last wrote this save. Drives last-write-wins."
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "save game"

    def __str__(self) -> str:
        return f"save for {self.user.username}"

    @property
    def position(self) -> str:
        position = self.blob.get("position") or {}
        return f"{position.get('quest_id', '-')}/{position.get('encounter_id', '-')}"

    @property
    def reputation(self) -> int:
        return int(self.blob.get("rep", 0))
