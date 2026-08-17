import json

import pytest
from django.contrib.auth import get_user_model

from saves.models import SaveGame

User = get_user_model()

pytestmark = pytest.mark.django_db


def blob(rep=50, quest="act1-net-01-first-week"):
    return {"schemaVersion": 1, "state": {"rep": rep, "questId": quest}}


def put(client, payload):
    return client.put("/api/save", data=json.dumps(payload), content_type="application/json")


@pytest.fixture
def signed_in(client):
    user = User.objects.create_user(email="admin@meridian.example", password="Freight-2026-ok")
    client.force_login(user)
    return user


class TestAuthentication:
    def test_get_requires_an_account(self, client):
        assert client.get("/api/save").status_code == 401

    def test_put_requires_an_account(self, client):
        assert put(client, {"blob": blob(), "schema_version": 1, "updated_at": "2026-08-17T00:00:00Z"}).status_code == 401


class TestRoundTrip:
    def test_reports_no_save_before_the_first_upload(self, client, signed_in):
        assert client.get("/api/save").status_code == 404

    def test_stores_and_returns_the_blob_unchanged(self, client, signed_in):
        payload = {"blob": blob(rep=73), "schema_version": 1, "updated_at": "2026-08-17T10:00:00Z"}
        assert put(client, payload).status_code == 200

        stored = client.get("/api/save").json()
        assert stored["blob"] == payload["blob"]
        assert stored["schema_version"] == 1

    def test_a_blob_from_a_newer_build_survives_untouched(self, client, signed_in):
        """The server never interprets the save, so unknown fields must persist."""
        future = {"schemaVersion": 9, "state": {"rep": 50, "questId": "x"}, "somethingNew": [1, 2]}
        put(client, {"blob": future, "schema_version": 9, "updated_at": "2026-08-17T10:00:00Z"})

        assert client.get("/api/save").json()["blob"] == future

    def test_each_account_sees_only_its_own_save(self, client, signed_in):
        put(client, {"blob": blob(rep=73), "schema_version": 1, "updated_at": "2026-08-17T10:00:00Z"})

        other = User.objects.create_user(email="other@meridian.example", password="Freight-2026-ok")
        client.force_login(other)
        assert client.get("/api/save").status_code == 404


class TestLastWriteWins:
    def test_a_newer_upload_replaces_the_stored_save(self, client, signed_in):
        put(client, {"blob": blob(rep=50), "schema_version": 1, "updated_at": "2026-08-17T10:00:00Z"})
        resp = put(
            client, {"blob": blob(rep=80), "schema_version": 1, "updated_at": "2026-08-17T12:00:00Z"}
        )

        assert resp.json()["blob"]["state"]["rep"] == 80
        assert SaveGame.objects.get(user=signed_in).blob["state"]["rep"] == 80

    def test_a_stale_upload_is_refused_and_the_stored_save_returned(self, client, signed_in):
        """The laptop that was closed for a week must not overwrite the phone."""
        put(client, {"blob": blob(rep=80), "schema_version": 1, "updated_at": "2026-08-17T12:00:00Z"})
        resp = put(
            client, {"blob": blob(rep=50), "schema_version": 1, "updated_at": "2026-08-17T10:00:00Z"}
        )

        assert resp.status_code == 200
        assert resp.json()["blob"]["state"]["rep"] == 80
        assert SaveGame.objects.get(user=signed_in).blob["state"]["rep"] == 80

    def test_an_identical_timestamp_does_not_overwrite(self, client, signed_in):
        stamp = "2026-08-17T12:00:00Z"
        put(client, {"blob": blob(rep=80), "schema_version": 1, "updated_at": stamp})
        resp = put(client, {"blob": blob(rep=10), "schema_version": 1, "updated_at": stamp})

        assert resp.json()["blob"]["state"]["rep"] == 80


class TestValidation:
    def test_rejects_a_malformed_timestamp(self, client, signed_in):
        resp = put(client, {"blob": blob(), "schema_version": 1, "updated_at": "last Tuesday"})
        assert resp.status_code == 400

    def test_rejects_an_oversized_blob(self, client, signed_in):
        huge = {"schemaVersion": 1, "state": {"rep": 50, "questId": "x"}, "junk": "x" * 600_000}
        resp = put(client, {"blob": huge, "schema_version": 1, "updated_at": "2026-08-17T10:00:00Z"})
        assert resp.status_code == 413
