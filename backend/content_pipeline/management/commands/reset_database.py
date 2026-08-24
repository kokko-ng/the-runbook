"""Drop every table in the configured database.

This exists for exactly one situation: the production database still holds the
schema and migration history of a superseded build, and the new one needs to
migrate from nothing. It is destructive, so it refuses to run without --yes and
it is only ever invoked by the deploy script when a one-shot marker file is
present, which the script then deletes.

Take a dump first. deploy/pa_deploy.sh does.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Drop all tables in the default database. Destructive, and means it."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Confirm the data loss.")

    def handle(self, *args, **options):
        if not options["yes"]:
            raise CommandError("This drops every table. Pass --yes if that is what you want.")

        vendor = connection.vendor
        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            if not tables:
                self.stdout.write("Database is already empty.")
                return
            self.stdout.write(f"Dropping {len(tables)} tables from the {vendor} database.")
            if vendor == "mysql":
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            elif vendor == "sqlite":
                cursor.execute("PRAGMA foreign_keys = OFF")
            for table in tables:
                cursor.execute(f"DROP TABLE IF EXISTS {connection.ops.quote_name(table)}")
            if vendor == "mysql":
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
            elif vendor == "sqlite":
                cursor.execute("PRAGMA foreign_keys = ON")
        self.stdout.write(self.style.SUCCESS("Database emptied. Run migrate next."))
