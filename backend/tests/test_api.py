import json

import pytest

from analytics.models import AnalyticsEvent


@pytest.mark.django_db
def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok"}


@pytest.mark.django_db
def test_create_event(client):
    resp = client.post(
        "/api/events",
        data=json.dumps(
            {
                "anonymous_id": "anon-123",
                "type": "encounter_resolved",
                "encounter_id": "act1-net-01:e2",
                "outcome": "first_try",
            }
        ),
        content_type="application/json",
    )
    assert resp.status_code == 204
    event = AnalyticsEvent.objects.get()
    assert event.anonymous_id == "anon-123"
    assert event.type == "encounter_resolved"
    assert event.user is None


@pytest.mark.django_db
def test_email_user_model():
    from accounts.models import User

    user = User.objects.create_user(email="player@example.com", password="s3cret-pass")
    assert user.username == "player@example.com"
    assert User.objects.get(email="player@example.com") == user
