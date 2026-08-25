"""The whole HTTP API.

It is deliberately small. The game runs entirely in the browser; the server only
holds optional accounts, one save blob per account, and anonymous telemetry.
There are no entitlement checks anywhere because there is nothing to buy.
"""

from __future__ import annotations

import json
from datetime import datetime
from datetime import timezone as dt_timezone

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.middleware.csrf import CsrfViewMiddleware
from django.utils import timezone
from ninja import NinjaAPI, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from ninja.throttling import AnonRateThrottle, AuthRateThrottle

from analytics.models import AnalyticsEvent
from feedback.models import Feedback
from saves.models import SaveGame

User = get_user_model()

api = NinjaAPI(
    title="The Runbook API",
    version="1.0.0",
    description="Optional accounts, save sync and anonymous telemetry.",
)

MAX_BLOB_BYTES = 256 * 1024
MAX_MESSAGE_CHARS = 2000
MAX_CONTEXT_BYTES = 8 * 1024
SAVE_SCHEMA_VERSION = 1


def require_csrf(request) -> None:
    """Run Django's CSRF check on an endpoint that has no session auth yet.

    django-ninja exempts its views from the CSRF middleware and lets the session
    auth class do the check, which leaves login, signup and telemetry unchecked.
    They are same-origin POSTs from our own SPA, so hold them to the same rule:
    without this, a page on another domain could log a visitor into an account
    it controls.
    """
    reason = CsrfViewMiddleware(lambda request: HttpResponse()).process_view(
        request, None, (), {}
    )
    if reason is not None:
        raise HttpError(403, "CSRF verification failed. Reload the page and try again.")


# --------------------------------------------------------------------------
# schemas
# --------------------------------------------------------------------------


class Credentials(Schema):
    username: str
    password: str


class Me(Schema):
    username: str | None = None
    authenticated: bool = False


class SavePayload(Schema):
    schema_version: int = SAVE_SCHEMA_VERSION
    updated_at: datetime
    blob: dict


class SaveOut(Schema):
    schema_version: int
    updated_at: datetime
    blob: dict


class EventIn(Schema):
    type: str
    anonymous_id: str = ""
    quest_id: str = ""
    encounter_id: str = ""
    outcome: str = ""
    meta: dict = {}


class EventBatch(Schema):
    events: list[EventIn]


class FeedbackIn(Schema):
    category: str
    message: str = ""
    anonymous_id: str = ""
    context: dict = {}


# --------------------------------------------------------------------------
# meta
# --------------------------------------------------------------------------


@api.get("/health", auth=None, tags=["meta"])
def health(request):
    return {"status": "ok", "time": timezone.now().isoformat()}


# --------------------------------------------------------------------------
# accounts
# --------------------------------------------------------------------------


def _clean_username(raw: str) -> str:
    username = (raw or "").strip()
    if not 3 <= len(username) <= 30:
        raise HttpError(400, "Pick a username between 3 and 30 characters.")
    if not username.replace("_", "").replace("-", "").replace(".", "").isalnum():
        raise HttpError(400, "Usernames may contain letters, numbers, dot, dash and underscore.")
    return username


@api.post("/auth/signup", response=Me, auth=None, tags=["accounts"],
          throttle=[AnonRateThrottle("10/h")])
def signup(request, payload: Credentials):
    """Create an account. Username and password only, by design.

    No email address is collected anywhere in this project, so there is no
    self-serve password reset: a forgotten password is reset by hand in the
    admin. The signup screen says so before the button.
    """
    require_csrf(request)
    username = _clean_username(payload.username)
    try:
        validate_password(payload.password)
    except ValidationError as exc:
        raise HttpError(400, " ".join(exc.messages)) from exc
    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, password=payload.password)
    except IntegrityError as exc:
        raise HttpError(409, "That username is taken.") from exc
    django_login(request, user)
    return Me(username=user.username, authenticated=True)


@api.post("/auth/login", response=Me, auth=None, tags=["accounts"],
          throttle=[AnonRateThrottle("20/h")])
def login(request, payload: Credentials):
    require_csrf(request)
    user = authenticate(request, username=payload.username.strip(), password=payload.password)
    if user is None:
        raise HttpError(401, "Wrong username or password.")
    django_login(request, user)
    return Me(username=user.username, authenticated=True)


@api.post("/auth/logout", response=Me, auth=None, tags=["accounts"])
def logout(request):
    django_logout(request)
    return Me(username=None, authenticated=False)


@api.get("/auth/me", response=Me, auth=None, tags=["accounts"])
def me(request):
    if request.user.is_authenticated:
        return Me(username=request.user.username, authenticated=True)
    return Me(username=None, authenticated=False)


# --------------------------------------------------------------------------
# saves
# --------------------------------------------------------------------------


@api.get("/save", response={200: SaveOut, 404: dict}, auth=django_auth, tags=["saves"])
def get_save(request):
    save = SaveGame.objects.filter(user=request.user).first()
    if save is None:
        return Status(404, {"detail": "No save on the server yet."})
    return Status(
        200,
        SaveOut(
            schema_version=save.schema_version, updated_at=save.client_updated_at, blob=save.blob
        ),
    )


@api.put("/save", response={200: SaveOut, 409: SaveOut}, auth=django_auth, tags=["saves"],
         throttle=[AuthRateThrottle("600/h")])
def put_save(request, payload: SavePayload):
    """Last write wins, decided by the browser's own clock stamp.

    If the stored save is newer than the one being pushed, the push is refused
    and the newer save comes back with a 409 so the client can adopt it. That is
    the whole conflict story: one save per account, no merging.
    """
    if len(str(payload.blob)) > MAX_BLOB_BYTES:
        raise HttpError(413, "Save is too large.")
    incoming = payload.updated_at
    if timezone.is_naive(incoming):
        incoming = timezone.make_aware(incoming, dt_timezone.utc)

    save = SaveGame.objects.filter(user=request.user).first()
    if save and save.client_updated_at > incoming:
        return Status(
            409,
            SaveOut(
                schema_version=save.schema_version, updated_at=save.client_updated_at, blob=save.blob
            ),
        )
    if save is None:
        save = SaveGame(user=request.user)
    save.schema_version = payload.schema_version
    save.blob = payload.blob
    save.client_updated_at = incoming
    save.save()
    return Status(
        200,
        SaveOut(
            schema_version=save.schema_version, updated_at=save.client_updated_at, blob=save.blob
        ),
    )


@api.delete("/save", auth=django_auth, tags=["saves"])
def delete_save(request):
    SaveGame.objects.filter(user=request.user).delete()
    return {"deleted": True}


# --------------------------------------------------------------------------
# analytics
# --------------------------------------------------------------------------


@api.post("/events", auth=None, tags=["analytics"], throttle=[AnonRateThrottle("300/h")])
def record_events(request, payload: EventBatch):
    require_csrf(request)
    user = request.user if request.user.is_authenticated else None
    known = {value for value, _ in AnalyticsEvent.TYPES}
    rows = [
        AnalyticsEvent(
            anonymous_id=event.anonymous_id[:64],
            user=user,
            type=event.type,
            quest_id=event.quest_id[:64],
            encounter_id=event.encounter_id[:64],
            outcome=event.outcome[:40],
            meta=event.meta if isinstance(event.meta, dict) else {},
        )
        for event in payload.events[:50]
        if event.type in known
    ]
    AnalyticsEvent.objects.bulk_create(rows)
    return {"recorded": len(rows)}


# --------------------------------------------------------------------------
# feedback
# --------------------------------------------------------------------------


@api.post("/feedback", auth=None, tags=["feedback"], throttle=[AnonRateThrottle("20/h")])
def submit_feedback(request, payload: FeedbackIn):
    """Take a player's report, with the state they were looking at.

    The context is whatever the client chose to send: route, quest, encounter,
    reputation, viewport. It is stored as given rather than modelled, because the
    useful fields change as the game does and a report from an old client should
    still be readable.
    """
    require_csrf(request)

    known = {value for value, _ in Feedback.CATEGORIES}
    if payload.category not in known:
        raise HttpError(400, "Pick one of the offered categories.")

    message = payload.message.strip()
    if len(message) > MAX_MESSAGE_CHARS:
        raise HttpError(400, f"Keep it under {MAX_MESSAGE_CHARS} characters.")

    context = payload.context if isinstance(payload.context, dict) else {}
    if len(json.dumps(context, default=str)) > MAX_CONTEXT_BYTES:
        context = {"truncated": True}

    entry = Feedback.objects.create(
        anonymous_id=payload.anonymous_id[:64],
        user=request.user if request.user.is_authenticated else None,
        category=payload.category,
        message=message,
        route=str(context.get("route", ""))[:200],
        quest_id=str(context.get("quest_id") or "")[:64],
        encounter_id=str(context.get("encounter_id") or "")[:64],
        content_version=str(context.get("content_version") or "")[:32],
        context=context,
    )
    return {"recorded": True, "id": entry.pk}
