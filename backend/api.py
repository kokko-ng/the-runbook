from django.db import connection
from ninja import NinjaAPI, Schema, Status

from analytics.models import AnalyticsEvent

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
