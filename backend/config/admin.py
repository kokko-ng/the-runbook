"""The back office.

Two jobs: user support (find a player, look at their save, reset a password) and
content QA (read the coverage matrix and any quest exactly as the linter sees
it, without a checkout).
"""

from django.contrib import admin
from django.http import Http404
from django.shortcuts import render
from django.urls import path

from content_pipeline import core


class RunbookAdminSite(admin.AdminSite):
    site_header = "The Runbook back office"
    site_title = "The Runbook"
    index_title = "Support and content QA"

    def get_urls(self):
        custom = [
            path("qa/coverage/", self.admin_view(self.coverage_view), name="qa_coverage"),
            path("qa/quests/", self.admin_view(self.quests_view), name="qa_quests"),
            path("qa/quests/<slug:quest_id>/", self.admin_view(self.quest_view), name="qa_quest"),
        ]
        return custom + super().get_urls()

    def each_context(self, request):
        context = super().each_context(request)
        context["qa_links"] = [
            ("Coverage matrix", "/admin/qa/coverage/"),
            ("Quest browser", "/admin/qa/quests/"),
        ]
        return context

    def _library(self):
        return core.load_library(core.content_dir())

    def coverage_view(self, request):
        library = self._library()
        report = core.build_coverage(library)
        rows = []
        for exam in library.objective_sets:
            for domain in exam.domains:
                for group in domain.groups:
                    for objective in group.objectives:
                        rows.append(
                            {
                                "exam": exam.exam,
                                "domain": domain.title,
                                "group": group.title,
                                "objective": objective,
                                "encounters": report.by_objective.get(objective.id, []),
                            }
                        )
        context = self.each_context(request)
        context.update(
            {
                "title": "Coverage matrix",
                "rows": rows,
                "unmapped": report.unmapped,
                "total": len(rows),
                "covered": len(rows) - len(report.unmapped),
            }
        )
        return render(request, "admin_qa/coverage.html", context)

    def quests_view(self, request):
        library = self._library()
        quests = sorted(library.quests, key=lambda q: (q.chapter, q.id))
        context = self.each_context(request)
        context.update({"title": "Quest browser", "quests": quests})
        return render(request, "admin_qa/quests.html", context)

    def quest_view(self, request, quest_id):
        library = self._library()
        quest = next((q for q in library.quests if q.id == quest_id), None)
        if quest is None:
            raise Http404(f"No quest with id {quest_id}")
        context = self.each_context(request)
        context.update({"title": quest.title, "quest": quest, "raw": quest.data})
        return render(request, "admin_qa/quest.html", context)
