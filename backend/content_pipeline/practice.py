"""Loading, linting and compiling the practice exams.

The practice exams sit beside the game rather than inside it: they carry no
reputation, no save state and no objective coverage, so they have their own
loader, linter and bundle. They are also the one part of the content written
by a language model, which is why the linter insists on the authorship stamp
and on a learn.microsoft.com source for every question.

Layout, one folder per exam code:

    content/practice_exams/az-104/blueprint.yaml   domains, weights, skills
    content/practice_exams/az-104/exam-1.yaml      one practice exam
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from content_pipeline.core import (
    Problem,
    _dealt_order,
    _iter_errors,
    _read_yaml,
    _schema,
    _write_json,
    check_prose,
    content_dir,
    word_count,
)

AUTHOR = "Opus 5.5"
MODEL_ID = "claude-opus-5-5"
SOURCE_PREFIX = "https://learn.microsoft.com/en-us/"
MAX_STEM_WORDS = 200
EXPLANATION_WORDS = (20, 200)
# An option that points at other options stops making sense once the bundle
# deals them into a new order.
CROSS_REFERENCE = re.compile(
    r"\b(all|none) of the above\b|\bboth [a-f] and [a-f]\b|\boptions? [a-f]\b", re.IGNORECASE
)
CHOOSE = {2: "choose two", 3: "choose three"}


@dataclass
class PracticeExam:
    data: dict[str, Any]
    path: Path
    # A file that does not parse is reported by the linter rather than
    # crashing the loader, so one bad exam never hides the others' problems.
    parse_error: str | None = None

    @property
    def id(self) -> str:
        return self.data.get("id", "")

    @property
    def questions(self) -> list[dict[str, Any]]:
        return list(self.data.get("questions", []))


@dataclass
class PracticeSet:
    folder: str
    blueprint: dict[str, Any]
    exams: list[PracticeExam]

    @property
    def exam(self) -> str:
        return self.blueprint.get("exam", "")

    def domain(self, domain_id: str) -> dict[str, Any] | None:
        return next((d for d in self.blueprint.get("domains", []) if d["id"] == domain_id), None)

    def skills(self, domain_id: str) -> set[str]:
        domain = self.domain(domain_id) or {}
        return {skill for group in domain.get("groups", []) for skill in group["skills"]}


def practice_dir(root: Path | None = None) -> Path:
    return Path(root or content_dir()) / "practice_exams"


def load_practice(root: Path | None = None) -> list[PracticeSet]:
    base = practice_dir(root)
    sets: list[PracticeSet] = []
    if not base.exists():
        return sets
    for folder in sorted(p for p in base.iterdir() if p.is_dir()):
        exams = [
            _load_exam(path)
            for path in sorted(folder.glob("exam-*.yaml"), key=lambda p: _exam_number(p))
        ]
        sets.append(PracticeSet(folder.name, _read_yaml(folder / "blueprint.yaml"), exams))
    return sets


def _load_exam(path: Path) -> PracticeExam:
    try:
        data = _read_yaml(path)
    except yaml.YAMLError as error:
        return PracticeExam({}, path, parse_error=str(error).splitlines()[0])
    return PracticeExam(data if isinstance(data, dict) else {}, path)


def _exam_number(path: Path) -> int:
    match = re.fullmatch(r"exam-(\d+)", path.stem)
    return int(match.group(1)) if match else 0


# --------------------------------------------------------------------------
# validation
# --------------------------------------------------------------------------


def validate_practice(sets: list[PracticeSet], root: Path | None = None) -> list[Problem]:
    root = Path(root or content_dir())
    blueprint_schema = _schema(root, "practice_blueprint")
    exam_schema = _schema(root, "practice_exam")
    problems: list[Problem] = []
    seen_stems: dict[str, str] = {}
    for practice in sets:
        where = f"practice_exams/{practice.folder}/blueprint.yaml"
        schema_problems = _iter_errors(blueprint_schema, practice.blueprint, where)
        problems += schema_problems
        if schema_problems:
            continue
        problems += _validate_blueprint(practice, where)
        numbers = [exam.data.get("number") for exam in practice.exams]
        if numbers != list(range(1, len(numbers) + 1)):
            problems.append(
                Problem(f"practice_exams/{practice.folder}", f"exam numbers {numbers} skip or repeat")
            )
        for exam in practice.exams:
            exam_where = f"practice_exams/{practice.folder}/{exam.path.name}"
            if exam.parse_error:
                problems.append(Problem(exam_where, f"does not parse: {exam.parse_error}"))
                continue
            exam_problems = _iter_errors(exam_schema, exam.data, exam_where)
            problems += exam_problems
            if not exam_problems:
                problems += _validate_exam(practice, exam, exam_where, seen_stems)
    return problems


def _validate_blueprint(practice: PracticeSet, where: str) -> list[Problem]:
    problems: list[Problem] = []
    blueprint = practice.blueprint
    if practice.folder != blueprint["exam"].lower():
        problems.append(Problem(where, f"exam {blueprint['exam']} lives in the wrong folder"))
    prefix = blueprint["exam"].replace("-", "")
    total = sum(domain["questions"] for domain in blueprint["domains"])
    for domain in blueprint["domains"]:
        if not domain["id"].startswith(prefix + "-"):
            problems.append(Problem(where, f"domain {domain['id']} does not belong to {prefix}"))
        low, high = (int(n) for n in domain["weight"].rstrip("%").split("-"))
        share = 100 * domain["questions"] / total
        if not low <= share <= high:
            problems.append(
                Problem(
                    where,
                    f"domain {domain['id']} deals {domain['questions']}/{total} questions "
                    f"({share:.1f}%), outside its published {domain['weight']}",
                )
            )
    return problems


def _validate_exam(
    practice: PracticeSet, exam: PracticeExam, where: str, seen_stems: dict[str, str]
) -> list[Problem]:
    problems: list[Problem] = []
    data = exam.data
    expected_id = f"{practice.folder}-{data['number']}"
    if data["id"] != expected_id or exam.path.stem != f"exam-{data['number']}":
        problems.append(Problem(where, f"id and file name must both follow {expected_id}"))
    if data["exam"] != practice.exam:
        problems.append(Problem(where, f"exam {data['exam']} sits in the {practice.exam} folder"))

    questions = data["questions"]
    expected_ids = [f"q{n:02d}" for n in range(1, len(questions) + 1)]
    if [q["id"] for q in questions] != expected_ids:
        problems.append(Problem(where, "question ids must run q01, q02, ... without gaps"))

    wanted = {d["id"]: d["questions"] for d in practice.blueprint["domains"]}
    dealt = {domain_id: 0 for domain_id in wanted}
    for question in questions:
        if question["domain"] in dealt:
            dealt[question["domain"]] += 1
    for domain_id, count in wanted.items():
        if dealt[domain_id] != count:
            problems.append(
                Problem(
                    where,
                    f"domain {domain_id} has {dealt[domain_id]} questions; the blueprint deals "
                    f"{count}",
                )
            )

    for question in questions:
        spot = f"{where} {question['id']}"
        problems += _validate_question(practice, question, spot)
        stem_key = " ".join(re.findall(r"[a-z0-9]+", question["stem"].lower()))
        if stem_key in seen_stems:
            problems.append(Problem(spot, f"repeats the stem of {seen_stems[stem_key]}"))
        seen_stems.setdefault(stem_key, spot)
    return problems


def _validate_question(practice: PracticeSet, question: dict[str, Any], spot: str) -> list[Problem]:
    problems: list[Problem] = []
    if practice.domain(question["domain"]) is None:
        problems.append(Problem(spot, f"unknown domain {question['domain']}"))
    elif question["skill"] not in practice.skills(question["domain"]):
        problems.append(
            Problem(spot, f"skill {question['skill']!r} is not listed under {question['domain']}")
        )

    options = question["options"]
    option_ids = [option["id"] for option in options]
    if option_ids != list("abcdef"[: len(options)]):
        problems.append(Problem(spot, "option ids must run a, b, c, ... in order"))
    texts = [option["text"].strip().lower() for option in options]
    if len(set(texts)) != len(texts):
        problems.append(Problem(spot, "two options carry the same text"))
    for option in options:
        if CROSS_REFERENCE.search(option["text"]):
            problems.append(
                Problem(spot, f"option {option['id']} refers to other options by position")
            )
        problems += check_prose(option["text"], f"{spot} option {option['id']}")

    answer = question["answer"]
    unknown = sorted(set(answer) - set(option_ids))
    if unknown:
        problems.append(Problem(spot, f"answer names options that do not exist: {unknown}"))
    stem = question["stem"].lower()
    if question["kind"] == "single":
        if len(answer) != 1:
            problems.append(Problem(spot, "a single-answer question has exactly one answer"))
        if any(phrase in stem for phrase in CHOOSE.values()):
            problems.append(Problem(spot, "a single-answer question must not say choose two/three"))
    else:
        if len(answer) not in CHOOSE:
            problems.append(Problem(spot, "a multiple-answer question has two or three answers"))
        elif CHOOSE[len(answer)] not in stem:
            problems.append(
                Problem(spot, f"a {len(answer)}-answer question must say {CHOOSE[len(answer)]!r}")
            )
        if len(answer) >= len(options) - 1:
            problems.append(Problem(spot, "leave at least two wrong options"))

    if word_count(question["stem"]) > MAX_STEM_WORDS:
        problems.append(Problem(spot, f"stem runs past {MAX_STEM_WORDS} words"))
    low, high = EXPLANATION_WORDS
    if not low <= word_count(question["explanation"]) <= high:
        problems.append(Problem(spot, f"explanation must run {low} to {high} words"))
    problems += check_prose(question["stem"], f"{spot} stem")
    problems += check_prose(question["explanation"], f"{spot} explanation")
    for source in question["sources"]:
        if not source.startswith(SOURCE_PREFIX):
            problems.append(Problem(spot, f"source {source} is not on learn.microsoft.com"))
    return problems


# --------------------------------------------------------------------------
# compiling
# --------------------------------------------------------------------------


def deal_question(exam_id: str, question: dict[str, Any]) -> dict[str, Any]:
    """Deal a question's options out of authoring order and relabel them.

    Relabeling by seat matters here more than in the quests: the ids travel in
    the bundle, and an author's habit of writing the answer as option a would
    otherwise be readable from the JSON.
    """
    options = question["options"]
    order = _dealt_order(f"{exam_id}/{question['id']}", len(options))
    relabel = {options[index]["id"]: "abcdef"[seat] for seat, index in enumerate(order)}
    return {
        **question,
        "options": [
            {"id": "abcdef"[seat], "text": options[index]["text"]}
            for seat, index in enumerate(order)
        ],
        "answer": sorted(relabel[a] for a in question["answer"]),
    }


def build_practice(sets: list[PracticeSet], out_dir: Path) -> dict[str, int]:
    target = Path(out_dir) / "practice_exams"
    target.mkdir(parents=True, exist_ok=True)
    for stale in target.glob("*.json"):
        stale.unlink()

    index = []
    for practice in sets:
        blueprint = practice.blueprint
        index.append(
            {
                "exam": blueprint["exam"],
                "title": blueprint["title"],
                "study_guide_url": blueprint["study_guide_url"],
                "skills_measured_as_of": blueprint["skills_measured_as_of"],
                "time_limit_minutes": blueprint["time_limit_minutes"],
                "passing_percent": blueprint["passing_percent"],
                "domains": [
                    {
                        "id": d["id"],
                        "title": d["title"],
                        "weight": d["weight"],
                        "questions": d["questions"],
                    }
                    for d in blueprint["domains"]
                ],
                "exams": [
                    {
                        "id": exam.id,
                        "number": exam.data["number"],
                        "title": exam.data["title"],
                        "question_count": len(exam.questions),
                    }
                    for exam in practice.exams
                ],
            }
        )
        for exam in practice.exams:
            data = exam.data
            _write_json(
                target / f"{exam.id}.json",
                {
                    "id": exam.id,
                    "exam": data["exam"],
                    "number": data["number"],
                    "title": data["title"],
                    "author": data["author"],
                    "model_id": data["model_id"],
                    "written_on": data["written_on"],
                    "time_limit_minutes": blueprint["time_limit_minutes"],
                    "passing_percent": blueprint["passing_percent"],
                    "questions": [deal_question(exam.id, q) for q in exam.questions],
                },
            )
    _write_json(
        target / "index.json",
        {"author": AUTHOR, "model_id": MODEL_ID, "certifications": index},
    )
    return {
        "exams": sum(len(p.exams) for p in sets),
        "questions": sum(len(e.questions) for p in sets for e in p.exams),
    }
