import pytest


@pytest.fixture
def user(db, django_user_model):
    return django_user_model.objects.create_user(username="marek", password="correct-horse-42")


@pytest.fixture
def client_signed_in(client, user):
    client.force_login(user)
    return client
