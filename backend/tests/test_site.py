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
