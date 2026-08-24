"""Lint the authored content and check objective coverage.

    python manage.py validate_content            # everything, coverage enforced
    python manage.py validate_content --partial  # while a chapter is half-written
"""

import json
import sys

from django.core.management.base import BaseCommand, CommandError

from content_pipeline import core


class Command(BaseCommand):
    help = "Validate quest content against the schema, the house style and the coverage matrix."

    def add_arguments(self, parser):
        parser.add_argument(
            "--partial",
            action="store_true",
            help="Skip the coverage gate. For local work on an unfinished chapter only.",
        )
        parser.add_argument(
            "--require-all-chapters",
            action="store_true",
            help="Also fail if any chapter has no quests. This is the release gate.",
        )
        parser.add_argument("--json", action="store_true", help="Emit machine-readable output.")

    def handle(self, *args, **options):
        library = core.load_library()
        problems = core.validate(
            library,
            require_full_coverage=not options["partial"],
            require_all_chapters=options["require_all_chapters"],
        )
        coverage = core.build_coverage(library)
        total_objectives = sum(len(s.all_objectives) for s in library.objective_sets)

        if options["json"]:
            self.stdout.write(
                json.dumps(
                    {
                        "problems": [{"where": p.where, "message": p.message} for p in problems],
                        "objectives": total_objectives,
                        "covered": len(coverage.by_objective),
                        "unmapped": coverage.unmapped,
                        "pending": coverage.pending,
                        "quests": len(library.quests),
                        "encounters": sum(len(q.encounters) for q in library.quests),
                    },
                    indent=2,
                )
            )
        else:
            for problem in problems:
                self.stdout.write(self.style.ERROR(str(problem)))
            covered = len(coverage.by_objective)
            self.stdout.write(
                f"{len(library.quests)} quests, "
                f"{sum(len(q.encounters) for q in library.quests)} encounters, "
                f"{covered}/{total_objectives} objectives covered"
            )
            if coverage.unmapped:
                self.stdout.write(
                    self.style.ERROR(f"unmapped: {', '.join(sorted(coverage.unmapped))}")
                )
            if coverage.pending:
                self.stdout.write(
                    self.style.WARNING(
                        f"{len(coverage.pending)} objectives are in chapters that have not been "
                        "written yet"
                    )
                )

        if problems:
            raise CommandError(f"{len(problems)} content problem(s)")
        self.stdout.write(self.style.SUCCESS("content is clean"))
        sys.stdout.flush()
