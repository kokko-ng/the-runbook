from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class EmailUserManager(UserManager):
    def create_user(self, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        return super().create_user(username=email, email=email, password=password, **extra_fields)

    def create_superuser(self, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        return super().create_superuser(username=email, email=email, password=password, **extra_fields)


class User(AbstractUser):
    """Email-as-login user. username mirrors email to keep AbstractUser machinery intact."""

    email = models.EmailField(unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = EmailUserManager()

    def save(self, *args, **kwargs):
        self.username = self.email
        super().save(*args, **kwargs)
