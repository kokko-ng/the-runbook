from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from content_pipeline.compiler import compile_tree
from content_pipeline.coverage import build_coverage
from content_pipeline.loader import ContentError, load_tree
from content_pipeline.validator import validate

DEFAULT_OUT = "frontend/src/generated/content"


class Command(BaseCommand):
    help = "Validate then compile the content tree into JSON for the frontend bundle."

    def add_arguments(self, parser):
        parser.add_argument("--content-dir", default=str(settings.CONTENT_DIR))
        parser.add_argument(
            "--out",
            default=str(settings.REPO_DIR / DEFAULT_OUT),
            help=f"Output directory (defaults to <repo>/{DEFAULT_OUT}).",
        )
        parser.add_argument(
            "--skip-validation",
            action="store_true",
            help="Compile without validating. For debugging only; CI never uses this.",
        )

    def handle(self, *args, **options):
        root = Path(options["content_dir"])
        try:
            tree = load_tree(root)
        except ContentError as exc:
            raise CommandError(str(exc)) from exc

        if not options["skip_validation"]:
            problems = validate(tree)
            for problem in problems:
                self.stderr.write(self.style.ERROR(str(problem)))
            if problems:
                raise CommandError(f"{len(problems)} content problem(s) found; nothing compiled")

            failures = build_coverage(tree).failures()
            for failure in failures:
                self.stderr.write(self.style.ERROR(f"coverage: {failure}"))
            if failures:
                raise CommandError(f"{len(failures)} coverage failure(s); nothing compiled")

        out_dir = Path(options["out"])
        summary = compile_tree(tree, out_dir)
        self.stdout.write(
            self.style.SUCCESS(
                f"compiled {summary['quests']} quest(s) across "
                f"{summary['chapters']} chapter(s) to {out_dir}"
            )
        )
