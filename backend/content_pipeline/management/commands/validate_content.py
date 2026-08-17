from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from content_pipeline.coverage import build_coverage
from content_pipeline.loader import ContentError, load_tree
from content_pipeline.validator import validate


class Command(BaseCommand):
    help = "Validate the content tree against its JSON Schemas and lint rules."

    def add_arguments(self, parser):
        parser.add_argument(
            "--content-dir",
            default=str(settings.CONTENT_DIR),
            help="Content root (defaults to <repo>/content).",
        )
        parser.add_argument(
            "--matrix",
            action="store_true",
            help="Print the objective coverage matrix.",
        )
        parser.add_argument(
            "--require-all",
            action="store_true",
            help="Also fail when a domain has no authored quests (launch gate).",
        )

    def handle(self, *args, **options):
        root = Path(options["content_dir"])
        try:
            tree = load_tree(root)
        except ContentError as exc:
            raise CommandError(str(exc)) from exc

        problems = validate(tree)
        for problem in problems:
            self.stderr.write(self.style.ERROR(str(problem)))

        if problems:
            raise CommandError(f"{len(problems)} content problem(s) found")

        coverage = build_coverage(tree)
        if options["matrix"]:
            self._print_matrix(coverage)

        failures = coverage.failures(require_all=options["require_all"])
        for failure in failures:
            self.stderr.write(self.style.ERROR(f"coverage: {failure}"))
        if failures:
            raise CommandError(f"{len(failures)} coverage failure(s)")

        enforced = coverage.enforced
        covered = sum(domain.mapped_count for domain in enforced)
        total = sum(len(domain.objectives) for domain in enforced)
        self.stdout.write(
            self.style.SUCCESS(
                f"content ok: {len(tree.quests)} quest(s), "
                f"{covered}/{total} objective(s) covered across "
                f"{len(enforced)} authored domain(s); "
                f"{len(coverage.unauthored)} domain(s) not yet authored"
            )
        )

    def _print_matrix(self, coverage):
        rows = coverage.as_rows()
        width = max((len(row[0]) for row in rows), default=12)
        self.stdout.write("")
        self.stdout.write(f"{'OBJECTIVE'.ljust(width)}  {'DOMAIN'.ljust(12)}  STATUS      ENCOUNTERS")
        for objective_id, domain_id, status, encounters in rows:
            line = f"{objective_id.ljust(width)}  {domain_id.ljust(12)}  {status.ljust(10)}  {encounters}"
            if status == "MISSING":
                self.stdout.write(self.style.ERROR(line))
            elif status == "unauthored":
                self.stdout.write(self.style.WARNING(line))
            else:
                self.stdout.write(line)
        self.stdout.write("")
