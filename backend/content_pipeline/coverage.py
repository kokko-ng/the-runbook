"""Coverage matrix: exam objective id -> the encounters that teach it.

Scope rule: a domain becomes *enforced* as soon as it has at least one authored
non-bonus quest. Every objective in an enforced domain must map to at least one
encounter in a non-bonus quest, so bonus scenarios can never be the only place an
objective is taught. Domains with no quests yet are reported as unauthored, which
is a failure only under ``--require-all`` (the launch gate).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .loader import ContentTree
from .validator import ObjectiveRegistry


@dataclass
class DomainCoverage:
    id: str
    title: str
    chapter: str
    exam: str
    objectives: dict[str, list[str]] = field(default_factory=dict)
    bonus_only: dict[str, list[str]] = field(default_factory=dict)
    authored: bool = False

    @property
    def unmapped(self) -> list[str]:
        return [obj for obj, encounters in self.objectives.items() if not encounters]

    @property
    def mapped_count(self) -> int:
        return sum(1 for encounters in self.objectives.values() if encounters)


@dataclass
class CoverageReport:
    domains: list[DomainCoverage]

    @property
    def enforced(self) -> list[DomainCoverage]:
        return [domain for domain in self.domains if domain.authored]

    @property
    def unauthored(self) -> list[DomainCoverage]:
        return [domain for domain in self.domains if not domain.authored]

    def failures(self, require_all: bool = False, only: str | None = None) -> list[str]:
        """Coverage problems. `only` narrows enforcement to one domain, which is
        what parallel authoring of separate chapters needs."""
        problems: list[str] = []
        for domain in self.enforced:
            if only and domain.id != only:
                continue
            for objective_id in domain.unmapped:
                bonus = self.domain_bonus(domain, objective_id)
                if bonus:
                    problems.append(
                        f"{objective_id} ({domain.id}) is covered only by bonus quests "
                        f"({', '.join(bonus)}); bonus scenarios cannot carry sole coverage"
                    )
                else:
                    problems.append(f"{objective_id} ({domain.id}) is not covered by any encounter")
        if require_all:
            for domain in self.unauthored:
                if only and domain.id != only:
                    continue
                problems.append(f"{domain.id} ({domain.title}) has no authored quests")
        return problems

    @staticmethod
    def domain_bonus(domain: DomainCoverage, objective_id: str) -> list[str]:
        return domain.bonus_only.get(objective_id, [])

    def as_rows(self) -> list[tuple[str, str, str, str]]:
        """(objective id, domain id, status, encounter list) for printing."""
        rows: list[tuple[str, str, str, str]] = []
        for domain in self.domains:
            for objective_id, encounters in domain.objectives.items():
                if encounters:
                    status = "covered"
                elif not domain.authored:
                    status = "unauthored"
                elif self.domain_bonus(domain, objective_id):
                    status = "bonus-only"
                else:
                    status = "MISSING"
                listed = ", ".join(encounters) or ", ".join(
                    self.domain_bonus(domain, objective_id)
                )
                rows.append((objective_id, domain.id, status, listed))
        return rows


def build_coverage(tree: ContentTree) -> CoverageReport:
    registry = ObjectiveRegistry(tree.objectives)

    domains: dict[str, DomainCoverage] = {}
    for exam in registry.exams:
        for domain in exam.get("domains", []):
            coverage = DomainCoverage(
                id=domain["id"],
                title=domain["title"],
                chapter=domain["chapter"],
                exam=exam["exam"],
            )
            for cluster in domain.get("clusters", []):
                for objective in cluster.get("objectives", []):
                    coverage.objectives[objective["id"]] = []
            domains[domain["id"]] = coverage

    for item in tree.quests:
        quest = item.data
        domain = domains.get(quest["domain"])
        if domain is None:
            continue
        is_bonus = "bonus_variant_of" in quest
        if not is_bonus:
            domain.authored = True
        for encounter in quest["encounters"]:
            ref = f"{quest['id']}:{encounter['id']}"
            for objective_id in encounter["objectives"]:
                if objective_id not in domain.objectives:
                    # Cross-domain reference: attribute it to the owning domain.
                    owner = _domain_of(domains, objective_id)
                    if owner is None:
                        continue
                    target = owner
                else:
                    target = domain
                if is_bonus:
                    target.bonus_only.setdefault(objective_id, []).append(ref)
                else:
                    target.objectives[objective_id].append(ref)

    return CoverageReport(domains=list(domains.values()))


def _domain_of(domains: dict[str, DomainCoverage], objective_id: str) -> DomainCoverage | None:
    for domain in domains.values():
        if objective_id in domain.objectives:
            return domain
    return None
