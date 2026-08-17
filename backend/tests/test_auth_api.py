import json

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from accounts.api import reset_link_parts

User = get_user_model()

pytestmark = pytest.mark.django_db


def post(client, path, payload):
    return client.post(path, data=json.dumps(payload), content_type="application/json")


@pytest.fixture
def player():
    return User.objects.create_user(email="picker@meridian.example", password="Freight-2026-ok")


class TestSignup:
    def test_creates_an_account_and_signs_in(self, client):
        resp = post(
            client,
            "/api/auth/signup",
            {"email": "New.Admin@meridian.example", "password": "Freight-2026-ok"},
        )
        assert resp.status_code == 200
        # Email is normalized to lower case so sign-in is not case sensitive.
        assert resp.json() == {"email": "new.admin@meridian.example"}
        assert User.objects.filter(email="new.admin@meridian.example").exists()

        assert client.get("/api/auth/me").status_code == 200

    def test_rejects_a_duplicate_email_regardless_of_case(self, client, player):
        resp = post(
            client,
            "/api/auth/signup",
            {"email": "PICKER@meridian.example", "password": "Freight-2026-ok"},
        )
        assert resp.status_code == 409

    def test_rejects_a_weak_password(self, client):
        resp = post(
            client, "/api/auth/signup", {"email": "weak@meridian.example", "password": "password"}
        )
        assert resp.status_code == 400
        assert not User.objects.filter(email="weak@meridian.example").exists()

    def test_rejects_a_malformed_email(self, client):
        resp = post(client, "/api/auth/signup", {"email": "not-an-email", "password": "Freight-2026-ok"})
        assert resp.status_code == 422


class TestLogin:
    def test_signs_in_with_correct_credentials(self, client, player):
        resp = post(
            client,
            "/api/auth/login",
            {"email": "picker@meridian.example", "password": "Freight-2026-ok"},
        )
        assert resp.status_code == 200
        assert client.get("/api/auth/me").json() == {"email": "picker@meridian.example"}

    def test_rejects_a_wrong_password(self, client, player):
        resp = post(
            client, "/api/auth/login", {"email": "picker@meridian.example", "password": "wrong"}
        )
        assert resp.status_code == 401

    def test_gives_the_same_answer_for_an_unknown_account(self, client, player):
        """The endpoint must not reveal which addresses have accounts."""
        unknown = post(
            client, "/api/auth/login", {"email": "nobody@meridian.example", "password": "wrong"}
        )
        wrong = post(
            client, "/api/auth/login", {"email": "picker@meridian.example", "password": "wrong"}
        )
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.json() == wrong.json()

    def test_logout_ends_the_session(self, client, player):
        post(client, "/api/auth/login", {"email": "picker@meridian.example", "password": "Freight-2026-ok"})
        assert client.post("/api/auth/logout").status_code == 204
        assert client.get("/api/auth/me").status_code == 401


class TestPasswordReset:
    def test_sends_a_reset_email(self, client, player):
        resp = post(client, "/api/auth/password-reset", {"email": "picker@meridian.example"})
        assert resp.status_code == 202
        assert len(mail.outbox) == 1
        assert "reset" in mail.outbox[0].subject.lower()

    def test_reports_success_for_an_unknown_address_and_sends_nothing(self, client):
        resp = post(client, "/api/auth/password-reset", {"email": "nobody@meridian.example"})
        assert resp.status_code == 202
        assert mail.outbox == []

    def test_confirm_changes_the_password(self, client, player):
        uid, token = reset_link_parts(player)
        resp = post(
            client,
            "/api/auth/password-reset/confirm",
            {"uid": uid, "token": token, "password": "Kallang-2026-new"},
        )
        assert resp.status_code == 200

        player.refresh_from_db()
        assert player.check_password("Kallang-2026-new")

    def test_a_token_cannot_be_used_twice(self, client, player):
        uid, token = reset_link_parts(player)
        payload = {"uid": uid, "token": token, "password": "Kallang-2026-new"}
        assert post(client, "/api/auth/password-reset/confirm", payload).status_code == 200
        # Changing the password invalidates the token that authorized the change.
        assert post(client, "/api/auth/password-reset/confirm", payload).status_code == 400

    def test_rejects_a_forged_token(self, client, player):
        uid, _ = reset_link_parts(player)
        resp = post(
            client,
            "/api/auth/password-reset/confirm",
            {"uid": uid, "token": "made-up", "password": "Kallang-2026-new"},
        )
        assert resp.status_code == 400

    def test_rejects_a_weak_new_password(self, client, player):
        uid, token = reset_link_parts(player)
        resp = post(
            client,
            "/api/auth/password-reset/confirm",
            {"uid": uid, "token": token, "password": "password"},
        )
        assert resp.status_code == 400
        player.refresh_from_db()
        assert player.check_password("Freight-2026-ok")
