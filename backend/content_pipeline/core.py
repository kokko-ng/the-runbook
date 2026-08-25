"""Loading, linting and compiling the authored content.

Everything in here is plain Python on top of PyYAML and jsonschema so the same
code can run inside Django (`manage.py validate_content`) and standalone in CI.

The linter is the only thing standing between a typo and a player reading a
quest that cannot be finished, so it is deliberately strict and its messages
name the file, the quest and the encounter.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Objective:
    id: str
    text: str


@dataclass(frozen=True)
class Group:
    id: str
    title: str
    objectives: tuple[Objective, ...]


@dataclass(frozen=True)
class Domain:
    id: str
    title: str
    weight: str
    chapter: str
    groups: tuple[Group, ...]


@dataclass(frozen=True)
class ObjectiveSet:
    exam: str
    act: int
    title: str
    source_url: str
    skills_measured_as_of: str
    fetched_on: str
    domains: tuple[Domain, ...]

    @property
    def all_objectives(self) -> list[Objective]:
        return [o for d in self.domains for g in d.groups for o in g.objectives]


@dataclass
class Quest:
    id: str
    chapter: str
    title: str
    summary: str
    variant: str
    bonus_of: str | None
    objectives: list[str]
    encounters: list[dict[str, Any]]
    data: dict[str, Any]
    path: Path

    @property
    def is_bonus(self) -> bool:
        return self.variant == "bonus"


@dataclass
class Library:
    root: Path
    world: dict[str, Any]
    objective_sets: list[ObjectiveSet]
    diagrams: dict[str, dict[str, Any]]
    quests: list[Quest]
    legal: dict[str, str] = field(default_factory=dict)

    def objective(self, objective_id: str) -> Objective | None:
        return self._objective_index().get(objective_id)

    def _objective_index(self) -> dict[str, Objective]:
        if not hasattr(self, "_obj_cache"):
            self._obj_cache = {
                o.id: o for s in self.objective_sets for o in s.all_objectives
            }
        return self._obj_cache

    @property
    def chapters(self) -> list[dict[str, Any]]:
        return sorted(self.world["chapters"], key=lambda c: c["order"])

    def chapter(self, chapter_id: str) -> dict[str, Any] | None:
        return next((c for c in self.world["chapters"] if c["id"] == chapter_id), None)

    def quests_in(self, chapter_id: str) -> list[Quest]:
        return [q for q in self.quests if q.chapter == chapter_id]


@dataclass
class Problem:
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.where}: {self.message}"


@dataclass
class CoverageReport:
    by_objective: dict[str, list[str]]
    by_objective_core: dict[str, list[str]]
    unmapped: list[str]
    bonus_only: list[str]
    pending: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.unmapped and not self.bonus_only


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------


def content_dir() -> Path:
    try:
        from django.conf import settings

        return Path(settings.CONTENT_DIR)
    except Exception:  # pragma: no cover - standalone use
        return Path(__file__).resolve().parents[2] / "content"


def build_dir() -> Path:
    try:
        from django.conf import settings

        return Path(settings.CONTENT_BUILD_DIR)
    except Exception:  # pragma: no cover - standalone use
        return Path(__file__).resolve().parents[2] / "frontend" / "public" / "content"


def _read_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def _schema(root: Path, name: str) -> dict[str, Any]:
    with (root / "schema" / f"{name}.schema.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def load_library(root: Path | None = None) -> Library:
    root = Path(root or content_dir())
    world = _read_yaml(root / "world.yaml")

    objective_sets: list[ObjectiveSet] = []
    for path in sorted((root / "objectives").glob("*.yaml")):
        objective_sets.append(_to_objective_set(_read_yaml(path)))

    diagrams: dict[str, dict[str, Any]] = {}
    for path in sorted((root / "diagrams").glob("*.yaml")):
        diagrams[path.stem] = _read_yaml(path)

    quests: list[Quest] = []
    for path in sorted((root / "quests").rglob("*.yaml")):
        quests.append(_to_quest(_read_yaml(path), path))

    legal: dict[str, str] = {}
    legal_dir = root / "legal"
    if legal_dir.exists():
        for path in sorted(legal_dir.glob("*.md")):
            legal[path.stem] = path.read_text(encoding="utf-8")

    return Library(
        root=root,
        world=world,
        objective_sets=objective_sets,
        diagrams=diagrams,
        quests=quests,
        legal=legal,
    )


def _to_objective_set(data: dict[str, Any]) -> ObjectiveSet:
    domains = tuple(
        Domain(
            id=d["id"],
            title=d["title"],
            weight=d["weight"],
            chapter=d["chapter"],
            groups=tuple(
                Group(
                    id=g["id"],
                    title=g["title"],
                    objectives=tuple(Objective(o["id"], o["text"]) for o in g["objectives"]),
                )
                for g in d["groups"]
            ),
        )
        for d in data["domains"]
    )
    return ObjectiveSet(
        exam=data["exam"],
        act=data["act"],
        title=data["title"],
        source_url=data["source_url"],
        skills_measured_as_of=data["skills_measured_as_of"],
        fetched_on=data["fetched_on"],
        domains=domains,
    )


def _to_quest(data: dict[str, Any], path: Path) -> Quest:
    return Quest(
        id=data.get("id", path.stem),
        chapter=data.get("chapter", ""),
        title=data.get("title", ""),
        summary=data.get("summary", ""),
        variant=data.get("variant", "core"),
        bonus_of=data.get("bonus_of"),
        objectives=list(data.get("objectives", [])),
        encounters=list(data.get("encounters", [])),
        data=data,
        path=path,
    )


# --------------------------------------------------------------------------
# house style
# --------------------------------------------------------------------------

# en-GB forms that slip in when writing about Azure. The docs are en-US, so the
# game is en-US: a player who reads "authorisation" here and "authorization" in
# the portal is being taught to doubt one of them.
BRITISH_SPELLINGS = {
    "centre": "center",
    "centres": "centers",
    "colour": "color",
    "colours": "colors",
    "behaviour": "behavior",
    "behaviours": "behaviors",
    "organise": "organize",
    "organised": "organized",
    "organisation": "organization",
    "organisations": "organizations",
    "authorise": "authorize",
    "authorised": "authorized",
    "authorisation": "authorization",
    "licence": "license",
    "licences": "licenses",
    "catalogue": "catalog",
    "catalogues": "catalogs",
    "analyse": "analyze",
    "analysed": "analyzed",
    "initialise": "initialize",
    "initialised": "initialized",
    "optimise": "optimize",
    "optimised": "optimized",
    "optimisation": "optimization",
    "prioritise": "prioritize",
    "utilise": "utilize",
    "minimise": "minimize",
    "maximise": "maximize",
    "summarise": "summarize",
    "recognise": "recognize",
    "recognised": "recognized",
    "defence": "defense",
    "offence": "offense",
    "whilst": "while",
    "learnt": "learned",
    "labelled": "labeled",
    "labelling": "labeling",
    "travelling": "traveling",
    "modelling": "modeling",
    "programme": "program",
    "metres": "meters",
    "metre": "meter",
    "kilometres": "kilometers",
    "kilometre": "kilometer",
    "litres": "liters",
    "litre": "liter",
    "sceptical": "skeptical",
    "grey": "gray",
    "fibre": "fiber",
    "enquiry": "inquiry",
    "specialities": "specialties",
    "speciality": "specialty",
    "practise": "practice",
    "storey": "story",
    "tyre": "tire",
    "aeroplane": "airplane",
    "jewellery": "jewelry",
    "cheque": "check",
    "kerb": "curb",
    "greyed": "grayed",
    "labour": "labor",
    "labours": "labors",
    "favour": "favor",
    "favours": "favors",
    "favourite": "favorite",
    "flavour": "flavor",
    "neighbour": "neighbor",
    "honour": "honor",
    "rumour": "rumor",
    "armour": "armor",
    "behavioural": "behavioral",
    "centred": "centered",
    "travelled": "traveled",
    "fulfil": "fulfill",
    "fulfilment": "fulfillment",
    "instalment": "installment",
    "enrolment": "enrollment",
    "skilful": "skillful",
    "wilful": "willful",
    "counsellor": "counselor",
    "judgement": "judgment",
    "practising": "practicing",
    "licencing": "licensing",
    "defences": "defenses",
    "offences": "offenses",
    "analysing": "analyzing",
    "initialising": "initializing",
    "optimising": "optimizing",
    "prioritising": "prioritizing",
    "minimising": "minimizing",
    "maximising": "maximizing",
    "summarising": "summarizing",
    "recognising": "recognizing",
    "apologise": "apologize",
    "organising": "organizing",
    "authorising": "authorizing",
    "utilising": "utilizing",
    "digitise": "digitize",
    "digitised": "digitized",
    "normalise": "normalize",
    "normalised": "normalized",
    "synchronise": "synchronize",
    "synchronised": "synchronized",
    "customise": "customize",
    "customised": "customized",
    "standardise": "standardize",
    "specialised": "specialized",
    "specialise": "specialize",
    "categorise": "categorize",
    "prioritised": "prioritized",
    "criticise": "criticize",
    "emphasise": "emphasize",
}

# Straight quotes only: the command panes are monospace and a curly quote pasted
# into a terminal is a support ticket waiting to happen.
FORBIDDEN_CHARS = {
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "…": "...", " ": " ",
}

ALLOWED_COMMAND_PREFIXES = (
    "az ", "azcopy ", "kubectl ", "Get-Az", "Set-Az", "New-Az", "Remove-Az", "Update-Az",
    "Test-NetConnection", "Resolve-DnsName", "nslookup ", "dig ", "curl ", "ping ",
    "nc ", "ssh ", "portal:", "kql:", "log:", "docker ",
)


def _is_emoji(char: str) -> bool:
    if char in "\n\r\t":
        return False
    if ord(char) < 0x80:
        return False
    category = unicodedata.category(char)
    return category in {"So", "Sk", "Cs"} or ord(char) > 0x2500


def check_prose(text: str, where: str) -> list[Problem]:
    problems: list[Problem] = []
    for char in set(text):
        if char in FORBIDDEN_CHARS:
            problems.append(
                Problem(where, f"uses {char!r}; write {FORBIDDEN_CHARS[char]!r} instead")
            )
        elif _is_emoji(char):
            problems.append(Problem(where, f"contains the non-text character {char!r}"))
    # Strip possessives so "programme's" is caught the same as "programme".
    lowered = {word.rstrip("'s").rstrip("'") for word in re.findall(r"[a-z']+", text.lower())}
    lowered |= set(re.findall(r"[a-z]+", text.lower()))
    for word in lowered:
        if word in BRITISH_SPELLINGS:
            problems.append(
                Problem(where, f"en-GB spelling {word!r}; Azure docs use {BRITISH_SPELLINGS[word]!r}")
            )
    return problems


def word_count(text: str) -> int:
    return len(text.split())


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------

MAX_BEAT_WORDS = 250
CORRECT_REP = (2, 10)
WRONG_REP = (-15, -5)
CHAPTER_CORE_QUESTS = (5, 10)


def validate(
    library: Library,
    *,
    require_full_coverage: bool = True,
    require_all_chapters: bool = False,
) -> list[Problem]:
    """Lint everything.

    The coverage gate is scoped to chapters that have been written: an objective
    in a chapter with no quests yet is pending, not broken. Once every chapter
    holds quests that is the same thing as the full gate, and
    `require_all_chapters` is what proves it.
    """
    problems: list[Problem] = []
    problems += _validate_schemas(library)
    problems += _validate_world(library)
    problems += _validate_diagrams(library)
    problems += _validate_quests(library)
    if require_full_coverage:
        problems += _validate_chapters(library)
        report = build_coverage(library)
        for objective_id in report.unmapped:
            problems.append(
                Problem("coverage", f"objective {objective_id} is not covered by any encounter")
            )
        for objective_id in report.bonus_only:
            problems.append(
                Problem(
                    "coverage",
                    f"objective {objective_id} is only covered by a bonus quest; bonus content "
                    "must not carry unique coverage",
                )
            )
    if require_all_chapters:
        for chapter in library.world["chapters"]:
            if not library.quests_in(chapter["id"]):
                problems.append(
                    Problem(f"chapter {chapter['id']}", "has no quests, and every chapter must ship")
                )
    return problems


def _iter_errors(schema: dict[str, Any], instance: Any, where: str) -> list[Problem]:
    validator = Draft202012Validator(schema)
    problems = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in error.absolute_path) or "(root)"
        # Schema errors quote the whole offending instance, which for a quest is
        # the entire file. Keep the message readable.
        message = error.message if len(error.message) <= 240 else error.message[:237] + "..."
        problems.append(Problem(where, f"{location}: {message}"))
    return problems


def _validate_schemas(library: Library) -> list[Problem]:
    root = library.root
    problems: list[Problem] = []
    problems += _iter_errors(_schema(root, "world"), library.world, "world.yaml")

    objectives_schema = _schema(root, "objectives")
    for path in sorted((root / "objectives").glob("*.yaml")):
        problems += _iter_errors(objectives_schema, _read_yaml(path), str(path.name))

    diagram_schema = _schema(root, "diagram")
    for name, data in library.diagrams.items():
        problems += _iter_errors(diagram_schema, data, f"diagrams/{name}.yaml")

    quest_schema = _schema(root, "quest")
    for quest in library.quests:
        problems += _iter_errors(quest_schema, quest.data, _rel(quest.path, root))
    return problems


def _rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root.parent))
    except ValueError:  # pragma: no cover
        return str(path)


def _validate_world(library: Library) -> list[Problem]:
    problems: list[Problem] = []
    world = library.world
    rank_ids = {r["id"] for r in world["ranks"]}
    chapter_ids = [c["id"] for c in world["chapters"]]
    if len(set(chapter_ids)) != len(chapter_ids):
        problems.append(Problem("world.yaml", "duplicate chapter id"))

    domain_ids = {d.id for s in library.objective_sets for d in s.domains}
    for chapter in world["chapters"]:
        if chapter["rank"] not in rank_ids:
            problems.append(Problem("world.yaml", f"chapter {chapter['id']} has unknown rank"))
        if chapter["domain"] not in domain_ids:
            problems.append(
                Problem("world.yaml", f"chapter {chapter['id']} maps to unknown domain {chapter['domain']}")
            )
        problems += check_prose(chapter["blurb"], f"world.yaml:{chapter['id']}.blurb")

    for act in world["acts"]:
        for chapter_id in act["chapters"]:
            if chapter_id not in chapter_ids:
                problems.append(Problem("world.yaml", f"act {act['id']} lists unknown chapter {chapter_id}"))

    # Every domain in the inventory needs a chapter to live in, or its objectives
    # can never be reached.
    for objective_set in library.objective_sets:
        for domain in objective_set.domains:
            if domain.chapter not in chapter_ids:
                problems.append(
                    Problem(
                        f"objectives/{objective_set.exam}",
                        f"domain {domain.id} points at unknown chapter {domain.chapter}",
                    )
                )
    return problems


def _validate_diagrams(library: Library) -> list[Problem]:
    problems: list[Problem] = []
    for name, data in library.diagrams.items():
        where = f"diagrams/{name}.yaml"
        node_ids = [n["id"] for n in data.get("nodes", [])]
        edge_ids = [e["id"] for e in data.get("edges", [])]
        group_ids = {g["id"] for g in data.get("groups", [])}
        for collection, ids in (("node", node_ids), ("edge", edge_ids)):
            duplicates = {i for i in ids if ids.count(i) > 1}
            for duplicate in sorted(duplicates):
                problems.append(Problem(where, f"duplicate {collection} id {duplicate}"))
        known = set(node_ids)
        for node in data.get("nodes", []):
            if node["group"] not in group_ids:
                problems.append(Problem(where, f"node {node['id']} sits in undeclared group {node['group']}"))
        for edge in data.get("edges", []):
            for end in ("source", "target"):
                if edge[end] not in known:
                    problems.append(Problem(where, f"edge {edge['id']} points at unknown node {edge[end]}"))
    return problems


def _act_of_chapter(chapter_id: str) -> str:
    return chapter_id.split("-", 1)[0]


def _validate_quests(library: Library) -> list[Problem]:
    problems: list[Problem] = []
    seen_ids: dict[str, Path] = {}
    known_objectives = {o.id for s in library.objective_sets for o in s.all_objectives}
    speakers = {c["name"] for c in library.world["cast"]}
    core_ids = {q.id for q in library.quests if not q.is_bonus}

    for quest in library.quests:
        where = _rel(quest.path, library.root)
        if quest.id in seen_ids:
            problems.append(Problem(where, f"duplicate quest id {quest.id}"))
        seen_ids[quest.id] = quest.path
        if quest.path.stem != quest.id:
            problems.append(Problem(where, f"file name must match the quest id ({quest.id}.yaml)"))
        if library.chapter(quest.chapter) is None:
            problems.append(Problem(where, f"unknown chapter {quest.chapter}"))
        expected_dir = library.root / "quests" / _act_of_chapter(quest.chapter)
        if expected_dir not in quest.path.parents:
            problems.append(Problem(where, f"quest for {quest.chapter} must live under {expected_dir.name}/"))

        if quest.is_bonus:
            if not quest.bonus_of:
                problems.append(Problem(where, "bonus quests must name the core quest they harden"))
            elif quest.bonus_of not in core_ids:
                problems.append(Problem(where, f"bonus_of {quest.bonus_of} is not a core quest"))
            else:
                parent = next(q for q in library.quests if q.id == quest.bonus_of)
                if parent.chapter != quest.chapter:
                    problems.append(Problem(where, "a bonus quest must sit in the same chapter as its parent"))
        elif quest.bonus_of:
            problems.append(Problem(where, "bonus_of is only meaningful on a bonus quest"))

        for objective_id in quest.objectives:
            if objective_id not in known_objectives:
                problems.append(Problem(where, f"unknown objective {objective_id}"))
            elif not objective_id.startswith(_exam_prefix(quest.chapter)):
                problems.append(
                    Problem(where, f"objective {objective_id} belongs to the other act's exam")
                )

        problems += _validate_encounters(library, quest, where, known_objectives, speakers)

        claimed = {
            objective_id
            for encounter in quest.encounters
            for objective_id in encounter.get("objectives", quest.objectives)
        }
        for objective_id in quest.objectives:
            if objective_id not in claimed:
                problems.append(
                    Problem(where, f"objective {objective_id} is listed but no encounter claims it")
                )
    return problems


def _exam_prefix(chapter_id: str) -> str:
    return "AZ104-" if chapter_id.startswith("act1") else "AZ305-"


def _validate_encounters(
    library: Library,
    quest: Quest,
    where: str,
    known_objectives: set[str],
    speakers: set[str],
) -> list[Problem]:
    problems: list[Problem] = []
    seen: set[str] = set()
    nodes, edges = _diagram_ids(library, quest.chapter)

    for encounter in quest.encounters:
        eid = encounter.get("id", "?")
        spot = f"{where}:{quest.id}/{eid}"
        if eid in seen:
            problems.append(Problem(spot, "duplicate encounter id"))
        seen.add(eid)

        intro = encounter.get("intro", "")
        if word_count(intro) > MAX_BEAT_WORDS:
            problems.append(
                Problem(spot, f"intro is {word_count(intro)} words; the limit is {MAX_BEAT_WORDS}")
            )
        for field_name in ("intro", "title", "prompt", "question", "resolution"):
            if encounter.get(field_name):
                problems += check_prose(encounter[field_name], f"{spot}.{field_name}")

        speaker = encounter.get("speaker")
        if speaker and speaker not in speakers:
            problems.append(Problem(spot, f"speaker {speaker!r} is not in the cast"))

        for objective_id in encounter.get("objectives", []):
            if objective_id not in known_objectives:
                problems.append(Problem(spot, f"unknown objective {objective_id}"))
            elif objective_id not in quest.objectives:
                problems.append(
                    Problem(spot, f"objective {objective_id} must also be listed on the quest")
                )

        problems += _validate_ops(encounter.get("on_enter", []), nodes, edges, f"{spot}.on_enter")
        problems += _validate_sketch(encounter.get("sketch"), spot)

        etype = encounter.get("type")
        if etype in ("design", "knowledge"):
            problems += _validate_options(encounter.get("options", []), nodes, edges, spot, "options")
        elif etype == "troubleshoot":
            problems += _validate_options(encounter.get("fixes", []), nodes, edges, spot, "fixes")
            problems += _validate_troubleshoot(encounter, spot, speakers)
    return problems


def _validate_sketch(sketch: dict[str, Any] | None, spot: str) -> list[Problem]:
    """An inline diagram has to be readable and internally consistent."""
    if not sketch:
        return []
    problems: list[Problem] = []
    problems += check_prose(sketch.get("caption", ""), f"{spot}.sketch.caption")
    ids = [node["id"] for node in sketch.get("nodes", [])]
    duplicates = {node_id for node_id in ids if ids.count(node_id) > 1}
    for duplicate in sorted(duplicates):
        problems.append(Problem(spot, f"sketch has two nodes with id {duplicate}"))
    cells = [(node["col"], node["row"]) for node in sketch.get("nodes", [])]
    for cell in sorted({cell for cell in cells if cells.count(cell) > 1}):
        problems.append(Problem(spot, f"sketch puts two nodes in the same cell {cell}"))
    for node in sketch.get("nodes", []):
        problems += check_prose(node["label"], f"{spot}.sketch/{node['id']}.label")
        if node.get("note"):
            problems += check_prose(node["note"], f"{spot}.sketch/{node['id']}.note")
    for edge in sketch.get("edges", []):
        for end in ("source", "target"):
            if edge[end] not in ids:
                problems.append(Problem(spot, f"sketch edge points at unknown node {edge[end]}"))
        if edge.get("label"):
            problems += check_prose(edge["label"], f"{spot}.sketch.edge.label")
    return problems


def _validate_options(
    options: list[dict[str, Any]],
    nodes: set[str],
    edges: set[str],
    spot: str,
    label: str,
) -> list[Problem]:
    problems: list[Problem] = []
    correct = [o for o in options if o.get("correct")]
    if len(correct) != 1:
        problems.append(Problem(spot, f"{label} must hold exactly one correct answer, found {len(correct)}"))
    ids = [o.get("id") for o in options]
    if len(set(ids)) != len(ids):
        problems.append(Problem(spot, f"duplicate option id in {label}"))
    for option in options:
        oid = option.get("id", "?")
        rep = option.get("rep", 0)
        if option.get("correct"):
            if not CORRECT_REP[0] <= rep <= CORRECT_REP[1]:
                problems.append(
                    Problem(spot, f"{label}/{oid}: a correct answer restores {CORRECT_REP[0]}-{CORRECT_REP[1]} rep")
                )
        else:
            if not WRONG_REP[0] <= rep <= WRONG_REP[1]:
                problems.append(
                    Problem(spot, f"{label}/{oid}: a wrong answer costs {-WRONG_REP[1]}-{-WRONG_REP[0]} rep")
                )
            if not option.get("consequence"):
                problems.append(
                    Problem(spot, f"{label}/{oid}: a wrong answer needs an in-fiction consequence")
                )
        for field_name in ("label", "explain", "consequence"):
            if option.get(field_name):
                problems += check_prose(option[field_name], f"{spot}.{label}/{oid}.{field_name}")
        problems += _validate_ops(option.get("diagram", []), nodes, edges, f"{spot}.{label}/{oid}")
    return problems


def _validate_troubleshoot(encounter: dict[str, Any], spot: str, speakers: set[str]) -> list[Problem]:
    problems: list[Problem] = []
    budget = encounter.get("time_budget", 0)
    commands = encounter.get("commands", [])
    investigate = encounter.get("investigate", [])

    ids = [c.get("id") for c in commands]
    if len(set(ids)) != len(ids):
        problems.append(Problem(spot, "duplicate command id"))
    ids = [i.get("id") for i in investigate]
    if len(set(ids)) != len(ids):
        problems.append(Problem(spot, "duplicate investigate id"))

    cheapest = sorted(c.get("time_cost", 1) for c in commands)
    if len(cheapest) < 2 or sum(cheapest[:2]) > budget:
        problems.append(
            Problem(spot, f"time_budget {budget} does not allow two of the cheapest diagnostics")
        )
    for command in commands:
        cid = command.get("id", "?")
        cmd = command.get("cmd", "")
        if not cmd.startswith(ALLOWED_COMMAND_PREFIXES):
            problems.append(
                Problem(spot, f"commands/{cid}: {cmd.split()[0]!r} is not a recognized diagnostic tool")
            )
        problems += check_prose(cmd, f"{spot}.commands/{cid}.cmd")
        if command.get("note"):
            problems += check_prose(command["note"], f"{spot}.commands/{cid}.note")
    for step in investigate:
        iid = step.get("id", "?")
        problems += check_prose(step.get("action", ""), f"{spot}.investigate/{iid}.action")
        problems += check_prose(step.get("reveals", ""), f"{spot}.investigate/{iid}.reveals")
        if step.get("speaker") and step["speaker"] not in speakers:
            problems.append(Problem(spot, f"investigate/{iid}: speaker {step['speaker']!r} is not in the cast"))
    return problems


def _diagram_ids(library: Library, chapter_id: str) -> tuple[set[str], set[str]]:
    act = _act_of_chapter(chapter_id)
    data = library.diagrams.get(act, {})
    return (
        {n["id"] for n in data.get("nodes", [])},
        {e["id"] for e in data.get("edges", [])},
    )


def _validate_ops(
    ops: list[dict[str, Any]], nodes: set[str], edges: set[str], spot: str
) -> list[Problem]:
    problems: list[Problem] = []
    for op in ops:
        if "node" in op and op["node"] not in nodes:
            problems.append(Problem(spot, f"diagram op names undeclared node {op['node']}"))
        if "edge" in op and op["edge"] not in edges:
            problems.append(Problem(spot, f"diagram op names undeclared edge {op['edge']}"))
    return problems


def _validate_chapters(library: Library) -> list[Problem]:
    problems: list[Problem] = []
    for chapter in library.world["chapters"]:
        quests = library.quests_in(chapter["id"])
        core = [q for q in quests if not q.is_bonus]
        if not quests:
            continue  # a chapter with no quests yet is a milestone away, not a defect
        low, high = CHAPTER_CORE_QUESTS
        if not low <= len(core) <= high:
            problems.append(
                Problem(
                    f"chapter {chapter['id']}",
                    f"has {len(core)} core quests; a chapter holds {low}-{high}",
                )
            )
    return problems


# --------------------------------------------------------------------------
# coverage
# --------------------------------------------------------------------------


def build_coverage(library: Library) -> CoverageReport:
    by_objective: dict[str, list[str]] = {}
    by_objective_core: dict[str, list[str]] = {}

    for quest in library.quests:
        for encounter in quest.encounters:
            covered = encounter.get("objectives", quest.objectives)
            ref = f"{quest.id}/{encounter.get('id')}"
            for objective_id in covered:
                by_objective.setdefault(objective_id, []).append(ref)
                if not quest.is_bonus:
                    by_objective_core.setdefault(objective_id, []).append(ref)

    unmapped: list[str] = []
    bonus_only: list[str] = []
    pending: list[str] = []
    authored = {quest.chapter for quest in library.quests}
    for objective_set in library.objective_sets:
        for domain in objective_set.domains:
            for group in domain.groups:
                for objective in group.objectives:
                    if objective.id not in by_objective:
                        if domain.chapter in authored:
                            unmapped.append(objective.id)
                        else:
                            pending.append(objective.id)
                    elif objective.id not in by_objective_core:
                        bonus_only.append(objective.id)
    return CoverageReport(by_objective, by_objective_core, unmapped, bonus_only, pending)


# --------------------------------------------------------------------------
# compiling
# --------------------------------------------------------------------------


def content_version(library: Library) -> str:
    """A stable fingerprint of the authored content.

    Derived from file contents only, so the same tree always compiles to the
    same version and the frontend can cache on it.
    """
    digest = hashlib.sha256()
    for path in sorted(library.root.rglob("*")):
        if path.is_file() and path.suffix in {".yaml", ".json", ".md"}:
            digest.update(str(path.relative_to(library.root)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def _dealt_order(seed: str, count: int) -> list[int]:
    """A stable seating order for one encounter's answers.

    Authors write the correct answer first because a quest file reads better
    that way, but shipping it first would make every question free. The bundle
    therefore deals the answers into an order derived from the encounter's own
    identity: the same content always compiles to the same order, so a save
    made against one build still lines up with the next, and no position is
    systematically the right one.
    """
    order = list(range(count))
    digest = hashlib.blake2b(seed.encode(), digest_size=16).digest()
    for index in range(count - 1, 0, -1):
        swap = digest[(count - 1 - index) % len(digest)] % (index + 1)
        order[index], order[swap] = order[swap], order[index]
    return order


def deal_answers(quest: Quest) -> dict[str, Any]:
    """A copy of the quest with every answer list dealt out of authoring order."""
    data = deepcopy(quest.data)
    for encounter in data.get("encounters", []):
        for field_name in ("options", "fixes"):
            choices = encounter.get(field_name)
            if not choices:
                continue
            order = _dealt_order(f"{quest.id}/{encounter['id']}/{field_name}", len(choices))
            encounter[field_name] = [choices[index] for index in order]
    return data


def build_bundle(library: Library, out_dir: Path | None = None) -> dict[str, Any]:
    out_dir = Path(out_dir or build_dir())
    quests_dir = out_dir / "quests"
    quests_dir.mkdir(parents=True, exist_ok=True)
    for stale in quests_dir.glob("*.json"):
        stale.unlink()

    version = content_version(library)
    coverage = build_coverage(library)

    chapters = []
    for chapter in library.chapters:
        # Core quests in id order first, then the bonus variants: that is the
        # order a player works through a chapter.
        quests = sorted(library.quests_in(chapter["id"]), key=lambda q: (q.is_bonus, q.id))
        chapters.append(
            {
                **chapter,
                "quests": [
                    {
                        "id": q.id,
                        "title": q.title,
                        "summary": q.summary,
                        "variant": q.variant,
                        "bonus_of": q.bonus_of,
                        "objectives": q.objectives,
                        "estimated_minutes": q.data.get("estimated_minutes", 12),
                        "encounter_count": len(q.encounters),
                        "encounter_types": sorted({e["type"] for e in q.encounters}),
                    }
                    for q in quests
                ],
            }
        )

    index = {
        "version": version,
        "company": library.world["company"],
        "ranks": library.world["ranks"],
        "cast": library.world["cast"],
        "acts": library.world["acts"],
        "chapters": chapters,
        "exams": [
            {
                "exam": s.exam,
                "act": s.act,
                "title": s.title,
                "source_url": s.source_url,
                "skills_measured_as_of": s.skills_measured_as_of,
                "fetched_on": s.fetched_on,
                "domains": [
                    {
                        "id": d.id,
                        "title": d.title,
                        "weight": d.weight,
                        "chapter": d.chapter,
                        "groups": [
                            {
                                "id": g.id,
                                "title": g.title,
                                "objectives": [{"id": o.id, "text": o.text} for o in g.objectives],
                            }
                            for g in d.groups
                        ],
                    }
                    for d in s.domains
                ],
            }
            for s in library.objective_sets
        ],
        "diagrams": {act: data for act, data in library.diagrams.items()},
        "legal": sorted(library.legal),
    }

    _write_json(out_dir / "index.json", index)
    for quest in library.quests:
        _write_json(quests_dir / f"{quest.id}.json", deal_answers(quest))
    _write_json(
        out_dir / "coverage.json",
        {
            "version": version,
            "by_objective": coverage.by_objective,
            "unmapped": coverage.unmapped,
            "bonus_only": coverage.bonus_only,
            "totals": {
                "objectives": sum(len(s.all_objectives) for s in library.objective_sets),
                "covered": len(coverage.by_objective),
                "quests": len(library.quests),
                "encounters": sum(len(q.encounters) for q in library.quests),
            },
        },
    )
    legal_dir = out_dir / "legal"
    legal_dir.mkdir(exist_ok=True)
    for name, text in library.legal.items():
        (legal_dir / f"{name}.md").write_text(text, encoding="utf-8")

    return {
        "version": version,
        "quests": len(library.quests),
        "encounters": sum(len(q.encounters) for q in library.quests),
        "out_dir": str(out_dir),
    }


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=None, separators=(",", ":"), sort_keys=True, ensure_ascii=True),
        encoding="utf-8",
    )
