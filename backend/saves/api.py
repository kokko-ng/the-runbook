"""Save sync.

The server stores one opaque blob per account and never interprets it. Conflicts
resolve last-write-wins on the client-supplied `updated_at`, which is enough for
a single-player game where the realistic conflict is "I played on my phone on the
train and then opened my laptop".
"""

import json

from django.utils.dateparse import parse_datetime
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import Field

from .models import SaveGame

router = Router(tags=["save"], auth=django_auth)

# A save is small; anything this large is a bug or an attack, not a game.
MAX_BLOB_BYTES = 512 * 1024


class SaveIn(Schema):
    blob: dict
    schema_version: int = Field(ge=1)
    updated_at: str


class SaveOut(Schema):
    blob: dict
    schema_version: int
    updated_at: str


class NoSave(Schema):
    detail: str


@router.get("", response={200: SaveOut, 404: NoSave})
def get_save(request):
    try:
        save = SaveGame.objects.get(user=request.user)
    except SaveGame.DoesNotExist:
        return Status(404, {"detail": "This account has no saved game yet."})
    return Status(200, _as_out(save))


@router.put("", response={200: SaveOut})
def put_save(request, data: SaveIn):
    if len(json.dumps(data.blob)) > MAX_BLOB_BYTES:
        raise HttpError(413, "That save is too large.")

    updated_at = parse_datetime(data.updated_at)
    if updated_at is None:
        raise HttpError(400, "updated_at must be an ISO 8601 timestamp.")

    existing = SaveGame.objects.filter(user=request.user).first()
    if existing and existing.updated_at >= updated_at:
        # The stored save is newer or the same age, so the upload is stale.
        # Returning the stored one lets the client reconcile without a round trip.
        return Status(200, _as_out(existing))

    save, _ = SaveGame.objects.update_or_create(
        user=request.user,
        defaults={
            "blob": data.blob,
            "schema_version": data.schema_version,
            "updated_at": updated_at,
        },
    )
    return Status(200, _as_out(save))


def _as_out(save: SaveGame) -> dict:
    return {
        "blob": save.blob,
        "schema_version": save.schema_version,
        "updated_at": save.updated_at.isoformat(),
    }
