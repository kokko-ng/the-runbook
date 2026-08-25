import pytest


@pytest.fixture
def user(db, django_user_model):
    return django_user_model.objects.create_user(username="marek", password="correct-horse-42")


@pytest.fixture
def client_signed_in(client, user):
    client.force_login(user)
    return client


@pytest.fixture
def admin(django_user_model, client):
    user = django_user_model.objects.create_user(
        username="backoffice", password="long-enough-pass", is_staff=True, is_superuser=True
    )
    client.force_login(user)
    return client
