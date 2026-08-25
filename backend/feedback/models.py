from django.conf import settings
from django.db import models


class Feedback(models.Model):
    """Something a player took the trouble to tell us, with where they were.

    Analytics says an encounter is being failed a lot. This says why. The value
    is almost entirely in the context: a report that reads "this makes no sense"
    is useless without the quest, the encounter and the state the player was
    looking at, and nobody types that in by hand.
    """

    CATEGORIES = [
        ("confusing", "Confusing scenario or screen"),
        ("wrong", "Technically wrong"),
        ("bug", "Something is broken"),
        ("layout", "Looks wrong on my screen"),
        ("idea", "Suggestion"),
        ("praise", "This worked well"),
    ]

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    anonymous_id = models.CharField(max_length=64, blank=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    category = models.CharField(max_length=24, choices=CATEGORIES, db_index=True)
    message = models.TextField(blank=True)

    # Denormalized from the context so the back office can filter and search on
    # the three questions anybody actually asks first.
    route = models.CharField(max_length=200, blank=True, db_index=True)
    quest_id = models.CharField(max_length=64, blank=True, db_index=True)
    encounter_id = models.CharField(max_length=64, blank=True)
    content_version = models.CharField(max_length=32, blank=True)

    context = models.JSONField(
        default=dict, blank=True, help_text="Where the player was and what state they were in."
    )
    handled = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "feedback"
        verbose_name_plural = "feedback"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["category", "created_at"])]

    def __str__(self) -> str:
        where = self.quest_id or self.route or "somewhere"
        return f"{self.get_category_display()} at {where}"

    @property
    def summary(self) -> str:
        text = " ".join(self.message.split())
        return text[:90] + ("..." if len(text) > 90 else "") if text else "(no message)"
