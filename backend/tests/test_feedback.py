"""Feedback: the report matters much less than the state it arrived with."""

import json

import pytest

from feedback.models import Feedback

CONTEXT = {
    "route": "/play/a1net-q02",
    "route_name": "play",
    "quest_id": "a1net-q02",
    "quest_title": "The Peering Problem",
    "encounter_id": "a",
    "encounter_type": "troubleshoot",
    "attempts": 1,
    "time_left": 3,
    "rep": 47,
    "content_version": "b9171f50951a",
    "viewport": {"width": 390, "height": 844},
    "theme": "dark",
}


def post(client, payload):
    return client.post(
        "/api/feedback", data=json.dumps(payload), content_type="application/json"
    )


@pytest.mark.django_db
def test_feedback_records_where_the_player_was(client):
    response = post(client, {"category": "confusing", "message": "  The fix list contradicts the log.  ",
                             "anonymous_id": "abc123", "context": CONTEXT})
    assert response.status_code == 200
    assert response.json()["recorded"] is True

    entry = Feedback.objects.get()
    assert entry.category == "confusing"
    assert entry.message == "The fix list contradicts the log."
    assert entry.route == "/play/a1net-q02"
    assert entry.quest_id == "a1net-q02"
    assert entry.encounter_id == "a"
    assert entry.content_version == "b9171f50951a"
    assert entry.context["time_left"] == 3
    assert entry.context["viewport"]["width"] == 390
    assert entry.user is None
    assert entry.handled is False


@pytest.mark.django_db
def test_feedback_from_a_signed_in_player_is_attributed(client_signed_in):
    post(client_signed_in, {"category": "bug", "message": "The map is empty.", "context": CONTEXT})
    assert Feedback.objects.get().user.username == "marek"


@pytest.mark.django_db
def test_a_made_up_category_is_refused(client):
    response = post(client, {"category": "complaint", "message": "no"})
    assert response.status_code == 400
    assert Feedback.objects.count() == 0


@pytest.mark.django_db
def test_an_overlong_message_is_refused(client):
    response = post(client, {"category": "idea", "message": "x" * 2001})
    assert response.status_code == 400
    assert Feedback.objects.count() == 0


@pytest.mark.django_db
def test_feedback_without_a_message_is_still_a_signal(client):
    assert post(client, {"category": "praise", "context": {"route": "/skills"}}).status_code == 200
    assert Feedback.objects.get().message == ""


@pytest.mark.django_db
def test_an_enormous_context_is_dropped_rather_than_stored(client):
    huge = {"route": "/career", "junk": "x" * 20000}
    assert post(client, {"category": "bug", "message": "big", "context": huge}).status_code == 200
    assert Feedback.objects.get().context == {"truncated": True}


@pytest.mark.django_db
def test_the_back_office_lists_feedback_with_its_context(admin):
    Feedback.objects.create(category="wrong", message="NSG evaluation order is backwards",
                            route="/play/a1net-q03", quest_id="a1net-q03", context=CONTEXT)
    listing = admin.get("/admin/feedback/feedback/")
    assert listing.status_code == 200
    assert b"a1net-q03" in listing.content

    entry = Feedback.objects.get()
    detail = admin.get(f"/admin/feedback/feedback/{entry.pk}/change/")
    assert detail.status_code == 200
    body = detail.content.decode()
    assert "NSG evaluation order is backwards" in body
    assert "The Peering Problem" in body  # the context is rendered, not just stored
