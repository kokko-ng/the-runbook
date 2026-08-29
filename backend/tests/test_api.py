"""API behaviour: optional accounts, one save each, anonymous telemetry."""

import json

import pytest
from django.test import Client

from analytics.models import AnalyticsEvent
from saves.models import SaveGame

SAVE = {
    "schema_version": 1,
    "updated_at": "2026-08-24T10:00:00Z",
    "blob": {"rep": 62, "position": {"quest_id": "a1net-q02", "encounter_id": "a"}},
}


def post(client, path, payload):
    return client.post(path, data=json.dumps(payload), content_type="application/json")


def put(client, path, payload):
    return client.put(path, data=json.dumps(payload), content_type="application/json")


def test_health_is_open(client):
    assert client.get("/api/health").status_code == 200


@pytest.mark.django_db
def test_signup_creates_an_account_and_signs_in(client):
    response = post(
        client, "/api/auth/signup", {"username": "joana", "password": "long-enough-pass"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "joana", "authenticated": True}
    assert client.get("/api/auth/me").json()["authenticated"] is True


@pytest.mark.django_db
def test_signup_never_stores_an_email_address(client, django_user_model):
    post(client, "/api/auth/signup", {"username": "joana", "password": "long-enough-pass"})
    assert django_user_model.objects.get(username="joana").email == ""


@pytest.mark.django_db
def test_signup_rejects_a_weak_password(client):
    response = post(client, "/api/auth/signup", {"username": "joana", "password": "pass"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_signup_rejects_a_taken_username(client, user):
    response = post(
        client, "/api/auth/signup", {"username": "marek", "password": "long-enough-pass"}
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_signup_rejects_an_unusable_username(client):
    response = post(client, "/api/auth/signup", {"username": "a b", "password": "long-enough-pass"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_login_and_logout(client, user):
    wrong = post(client, "/api/auth/login", {"username": "marek", "password": "wrong-one"})
    assert wrong.status_code == 401
    right = post(client, "/api/auth/login", {"username": "marek", "password": "correct-horse-42"})
    assert right.status_code == 200
    assert client.get("/api/auth/me").json()["username"] == "marek"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["authenticated"] is False


@pytest.mark.django_db
def test_saves_need_an_account(client):
    assert client.get("/api/save").status_code == 401
    assert put(client, "/api/save", SAVE).status_code == 401


@pytest.mark.django_db
def test_save_round_trip(client_signed_in):
    assert client_signed_in.get("/api/save").status_code == 404
    assert put(client_signed_in, "/api/save", SAVE).status_code == 200
    stored = client_signed_in.get("/api/save").json()
    assert stored["blob"]["rep"] == 62
    assert SaveGame.objects.count() == 1


@pytest.mark.django_db
def test_a_second_save_overwrites_rather_than_multiplying(client_signed_in):
    put(client_signed_in, "/api/save", SAVE)
    later = {**SAVE, "updated_at": "2026-08-24T11:00:00Z", "blob": {"rep": 70}}
    assert put(client_signed_in, "/api/save", later).status_code == 200
    assert SaveGame.objects.count() == 1
    assert client_signed_in.get("/api/save").json()["blob"]["rep"] == 70


@pytest.mark.django_db
def test_an_older_save_is_refused_and_the_newer_one_comes_back(client_signed_in):
    put(
        client_signed_in,
        "/api/save",
        {**SAVE, "updated_at": "2026-08-24T12:00:00Z", "blob": {"rep": 80}},
    )
    stale = {**SAVE, "updated_at": "2026-08-24T09:00:00Z", "blob": {"rep": 10}}
    response = put(client_signed_in, "/api/save", stale)
    assert response.status_code == 409
    assert response.json()["blob"]["rep"] == 80


@pytest.mark.django_db
def test_deleting_a_save(client_signed_in):
    put(client_signed_in, "/api/save", SAVE)
    assert client_signed_in.delete("/api/save").status_code == 200
    assert SaveGame.objects.count() == 0


@pytest.mark.django_db
def test_events_are_accepted_anonymously(client):
    response = post(
        client,
        "/api/events",
        {
            "events": [
                {"type": "choice", "anonymous_id": "abc", "quest_id": "a1net-q02",
                 "encounter_id": "a", "outcome": "wrong"},
                {"type": "not_a_real_type", "anonymous_id": "abc"},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["recorded"] == 1
    event = AnalyticsEvent.objects.get()
    assert event.user is None
    assert event.outcome == "wrong"


@pytest.mark.django_db
def test_events_from_a_signed_in_player_are_attributed(client_signed_in):
    post(client_signed_in, "/api/events", {"events": [{"type": "pip", "anonymous_id": "abc"}]})
    assert AnalyticsEvent.objects.get().user.username == "marek"


@pytest.mark.django_db
def test_login_refuses_a_cross_site_post_without_a_csrf_token(user):
    strict = Client(enforce_csrf_checks=True)
    response = post(
        strict, "/api/auth/login", {"username": "marek", "password": "correct-horse-42"}
    )
    assert response.status_code == 403
