"""The non-API surface: the SPA fallback and the plain-text legal pages."""

import pytest


def test_unknown_paths_serve_the_single_page_app(client):
    response = client.get("/career")
    assert response.status_code == 200
    assert b"The Runbook" in response.content


def test_the_api_is_not_swallowed_by_the_spa_route(client):
    assert client.get("/api/health")["Content-Type"].startswith("application/json")


def test_legal_pages_are_available_as_plain_text(client):
    for page in ("privacy", "terms"):
        response = client.get(f"/legal/{page}.txt")
        assert response.status_code == 200
        assert response["Content-Type"].startswith("text/plain")
        assert b"Last updated" in response.content


def test_an_unknown_legal_page_is_a_404(client):
    assert client.get("/legal/refunds.txt").status_code == 404


@pytest.mark.django_db
def test_the_admin_requires_a_login(client):
    response = client.get("/admin/qa/coverage/")
    assert response.status_code == 302
    assert "/admin/login" in response["Location"]


@pytest.mark.django_db
def test_the_back_office_shows_the_coverage_matrix(admin):
    response = admin.get("/admin/qa/coverage/")
    assert response.status_code == 200
    body = response.content.decode()
    assert "Coverage matrix" in body
    assert "AZ104-4.1.2" in body
    # Every objective is mapped, so the view must not report any as uncovered.
    assert ">none<" not in body


@pytest.mark.django_db
def test_the_back_office_browses_quests(admin):
    listing = admin.get("/admin/qa/quests/")
    assert listing.status_code == 200
    assert "a1net-q02" in listing.content.decode()

    quest = admin.get("/admin/qa/quests/a1net-q02/")
    assert quest.status_code == 200
    body = quest.content.decode()
    assert "The Peering Problem" in body
    assert "az network vnet peering list" in body


@pytest.mark.django_db
def test_an_unknown_quest_is_a_404_in_the_back_office(admin):
    assert admin.get("/admin/qa/quests/no-such-quest/").status_code == 404


@pytest.mark.django_db
def test_create_admin_needs_no_email_address(django_user_model):
    from django.core.management import call_command

    call_command("create_admin", username="dana", password="long-enough-pass")
    user = django_user_model.objects.get(username="dana")
    assert user.is_superuser and user.is_staff
    assert user.email == ""
    assert user.check_password("long-enough-pass")


@pytest.mark.django_db
def test_create_admin_can_reset_a_player_without_granting_rights(django_user_model):
    from django.core.management import call_command

    django_user_model.objects.create_user(username="hendrik", password="old-password-here")
    call_command("create_admin", username="hendrik", password="new-password-here", player=True)
    user = django_user_model.objects.get(username="hendrik")
    assert not user.is_staff and not user.is_superuser
    assert user.check_password("new-password-here")
