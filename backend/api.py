"""The Runbook API.

Deliberately small. The game is fully playable with none of this reachable:
content ships in the frontend bundle and saves live in local storage. What is
here exists for optional accounts (cross-device save sync) and anonymous
gameplay analytics.
"""

from django.db import connection
from ninja import NinjaAPI, Schema, Status

from accounts.api import router as auth_router
from analytics.models import AnalyticsEvent
from saves.api import router as saves_router

api = NinjaAPI(title="The Runbook API", version="1.0")


class HealthOut(Schema):
    status: str
    db: str


class EventIn(Schema):
    anonymous_id: str
    type: str
    encounter_id: str = ""
    outcome: str = ""


@api.get("/health", response=HealthOut)
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db = "ok"
    except Exception:
        db = "error"
    return {"status": "ok", "db": db}


@api.post("/events", response={204: None})
def create_event(request, event: EventIn):
    AnalyticsEvent.objects.create(
        anonymous_id=event.anonymous_id[:64],
        user=request.user if request.user.is_authenticated else None,
        type=event.type[:64],
        encounter_id=event.encounter_id[:128],
        outcome=event.outcome[:64],
    )
    return Status(204, None)


api.add_router("/auth", auth_router)
api.add_router("/save", saves_router)
