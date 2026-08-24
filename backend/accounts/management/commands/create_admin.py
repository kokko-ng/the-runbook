"""Create or update a back-office administrator, without an email address.

Django's own createsuperuser insists on an email address in non-interactive
mode. This project collects none, so this is the way in:

    python manage.py create_admin --username dana --password '...'
    RUNBOOK_ADMIN_PASSWORD='...' python manage.py create_admin --username dana

It is also how a forgotten player password is reset, since there is no
self-serve reset: pass --player to leave staff and superuser flags alone.
"""

import getpass
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create or update an administrator (or reset a player's password) with no email address."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument(
            "--password",
            help="Prompted for if omitted. RUNBOOK_ADMIN_PASSWORD is used when set.",
        )
        parser.add_argument(
            "--player",
            action="store_true",
            help="Only set the password; do not grant staff or superuser rights.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"].strip()
        password = options["password"] or os.environ.get("RUNBOOK_ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass("Password: ")
        if not password:
            raise CommandError("A password is required.")

        user, created = User.objects.get_or_create(username=username)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        user.set_password(password)
        if not options["player"]:
            user.is_staff = True
            user.is_superuser = True
        user.save()
        action = "Created" if created else "Updated"
        role = "player" if options["player"] else "administrator"
        self.stdout.write(self.style.SUCCESS(f"{action} {role} {username}."))
