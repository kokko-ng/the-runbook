"""Compile the authored YAML into the JSON the frontend fetches at runtime.

The output is deterministic: same content in, byte-identical bundle out, which
is what lets the version stamp double as a cache key.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from content_pipeline import core


class Command(BaseCommand):
    help = "Compile content into frontend/public/content."

    def add_arguments(self, parser):
        parser.add_argument("--out", type=Path, default=None)
        parser.add_argument(
            "--skip-validation",
            action="store_true",
            help="Compile without linting first. CI never does this.",
        )
        parser.add_argument("--partial", action="store_true", help="Do not enforce coverage.")

    def handle(self, *args, **options):
        library = core.load_library()
        if not options["skip_validation"]:
            problems = core.validate(library, require_full_coverage=not options["partial"])
            if problems:
                for problem in problems:
                    self.stdout.write(self.style.ERROR(str(problem)))
                raise CommandError(f"refusing to compile: {len(problems)} content problem(s)")
        result = core.build_bundle(library, options["out"])
        self.stdout.write(
            self.style.SUCCESS(
                f"compiled {result['quests']} quests / {result['encounters']} encounters "
                f"at version {result['version']} into {result['out_dir']}"
            )
        )
