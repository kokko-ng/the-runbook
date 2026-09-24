"""The practice exams are the one AI-written part of the content, so lint them hard."""

import collections
import copy
import json

import pytest

from content_pipeline import core, practice


@pytest.fixture(scope="module")
def sets():
    return practice.load_practice()


def _problems(sets, mutate):
    patched = copy.deepcopy(sets)
    mutate(patched)
    return [str(problem) for problem in practice.validate_practice(patched)]


def _first_question(sets):
    return sets[0].exams[0].data["questions"][0]


def test_the_shipped_practice_exams_are_clean(sets):
    problems = practice.validate_practice(sets)
    assert problems == [], "\n".join(str(problem) for problem in problems)


def test_five_exams_for_each_certification(sets):
    assert {s.exam: len(s.exams) for s in sets} == {"AZ-104": 5, "AZ-305": 5, "AZ-700": 5}


def test_every_exam_says_who_wrote_it(sets):
    for practice_set in sets:
        for exam in practice_set.exams:
            assert exam.data["author"] == "Opus 5.5"
            assert exam.data["model_id"] == "claude-opus-5-5"


def test_every_source_is_on_microsoft_learn(sets):
    for practice_set in sets:
        for exam in practice_set.exams:
            for question in exam.questions:
                assert question["sources"]
                for source in question["sources"]:
                    assert source.startswith("https://learn.microsoft.com/en-us/")


def test_a_source_off_microsoft_learn_is_rejected(sets):
    def mutate(patched):
        _first_question(patched)["sources"] = ["https://example.com/azure-notes"]

    assert any("sources" in p for p in _problems(sets, mutate))


def test_a_different_author_is_rejected(sets):
    def mutate(patched):
        patched[0].exams[0].data["author"] = "Somebody"

    assert any("author" in p for p in _problems(sets, mutate))


def test_two_answers_on_a_single_answer_question_are_rejected(sets):
    def mutate(patched):
        question = _first_question(patched)
        question["kind"] = "single"
        question["answer"] = ["a", "b"]

    assert any("exactly one answer" in p for p in _problems(sets, mutate))


def test_a_multiple_answer_question_must_say_how_many(sets):
    def mutate(patched):
        question = _first_question(patched)
        question["kind"] = "multiple"
        question["answer"] = ["a", "b"]
        question["stem"] = "Which settings should you change on the storage account today?"

    assert any("choose two" in p for p in _problems(sets, mutate))


def test_a_skill_missing_from_the_blueprint_is_rejected(sets):
    def mutate(patched):
        _first_question(patched)["skill"] = "Juggle virtual machines"

    assert any("is not listed under" in p for p in _problems(sets, mutate))


def test_the_blueprint_domain_counts_are_enforced(sets):
    def mutate(patched):
        questions = patched[0].exams[0].data["questions"]
        last_domain = patched[0].blueprint["domains"][-1]["id"]
        questions[0]["domain"] = last_domain

    assert any("the blueprint deals" in p for p in _problems(sets, mutate))


def test_positional_options_are_rejected(sets):
    def mutate(patched):
        _first_question(patched)["options"][1]["text"] = "All of the above"

    assert any("by position" in p for p in _problems(sets, mutate))


def test_a_repeated_stem_is_rejected(sets):
    def mutate(patched):
        exams = patched[0].exams
        exams[1].data["questions"][0]["stem"] = exams[0].data["questions"][0]["stem"]

    assert any("repeats the stem" in p for p in _problems(sets, mutate))


def test_blueprint_weights_stay_inside_the_published_ranges(sets):
    for practice_set in sets:
        total = sum(d["questions"] for d in practice_set.blueprint["domains"])
        for domain in practice_set.blueprint["domains"]:
            low, high = (int(n) for n in domain["weight"].rstrip("%").split("-"))
            assert low <= 100 * domain["questions"] / total <= high


def test_dealing_is_stable_lossless_and_relabels(sets):
    for practice_set in sets:
        for exam in practice_set.exams:
            for question in exam.questions:
                dealt = practice.deal_question(exam.id, question)
                assert dealt == practice.deal_question(exam.id, question)
                seats = list("abcdef"[: len(dealt["options"])])
                assert [o["id"] for o in dealt["options"]] == seats
                texts = {o["id"]: o["text"] for o in question["options"]}
                dealt_texts = {o["id"]: o["text"] for o in dealt["options"]}
                assert sorted(texts.values()) == sorted(dealt_texts.values())
                assert sorted(texts[a] for a in question["answer"]) == sorted(
                    dealt_texts[a] for a in dealt["answer"]
                )


def test_no_seat_is_systematically_the_answer(sets):
    seats = collections.Counter()
    for practice_set in sets:
        for exam in practice_set.exams:
            for question in exam.questions:
                if question["kind"] == "single":
                    seats[practice.deal_question(exam.id, question)["answer"][0]] += 1
    total = sum(seats.values())
    assert total
    assert max(seats.values()) / total < 0.4, seats


def test_the_bundle_carries_every_exam(sets, tmp_path):
    result = practice.build_practice(sets, tmp_path)
    index = json.loads((tmp_path / "practice_exams" / "index.json").read_text())
    assert index["author"] == "Opus 5.5"
    ids = [exam["id"] for cert in index["certifications"] for exam in cert["exams"]]
    assert len(ids) == result["exams"] == 15
    for exam_id in ids:
        exam = json.loads((tmp_path / "practice_exams" / f"{exam_id}.json").read_text())
        assert exam["author"] == "Opus 5.5"
        assert len(exam["questions"]) == 40


def test_the_practice_bundle_is_deterministic(sets, tmp_path):
    practice.build_practice(sets, tmp_path / "one")
    practice.build_practice(sets, tmp_path / "two")
    for path in sorted((tmp_path / "one" / "practice_exams").glob("*.json")):
        assert path.read_bytes() == (tmp_path / "two" / "practice_exams" / path.name).read_bytes()


def test_practice_files_feed_the_content_version():
    library = core.load_library()
    assert any(
        path.relative_to(library.root).parts[0] == "practice_exams"
        for path in library.root.rglob("*.yaml")
    )
