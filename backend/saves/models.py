from django.conf import settings
from django.db import models


class SaveGame(models.Model):
    """One server-side save per account, for syncing between devices.

    The blob is the same versioned JSON the browser keeps in local storage, so
    the client can hand it over unchanged. The server never interprets it: game
    rules live in the engine, and a save written by a newer build must survive a
    round trip through an older server untouched.
    """

    # Not related_name="save": that would shadow Model.save() on the user and
    # break every write to a User instance.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="save_game"
    )
    blob = models.JSONField()
    schema_version = models.PositiveIntegerField()
    # Client-supplied timestamp of the save, used to resolve last-write-wins.
    updated_at = models.DateTimeField()
    synced_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"save for {self.user_id} (v{self.schema_version})"
