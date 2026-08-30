"""The linter is the safety net for hundreds of authored files, so test it."""

import collections
import copy
import json

import pytest
import yaml

from content_pipeline import core


@pytest.fixture(scope="module")
def library():
    return core.load_library()


def test_the_shipped_content_is_clean(library):
    problems = core.validate(library, require_full_coverage=False)
    assert problems == [], "\n".join(str(problem) for problem in problems)


def test_every_authored_chapter_is_a_real_chapter(library):
    known = {chapter["id"] for chapter in library.world["chapters"]}
    assert {quest.chapter for quest in library.quests} <= known


def test_objectives_are_transcribed_from_the_official_guides(library):
    assert {objective_set.exam for objective_set in library.objective_sets} == {"AZ-104", "AZ-305"}
    total = sum(len(objective_set.all_objectives) for objective_set in library.objective_sets)
    assert total == 131
    for objective_set in library.objective_sets:
        assert objective_set.source_url.startswith("https://learn.microsoft.com/")


def test_coverage_counts_only_core_quests(library):
    report = core.build_coverage(library)
    for quest in library.quests:
        if quest.is_bonus:
            for objective in quest.objectives:
                assert objective in report.by_objective_core, (
                    f"{quest.id} carries unique coverage for {objective}"
                )


def _quest(library, quest_id="a1net-q01"):
    return copy.deepcopy(next(q for q in library.quests if q.id == quest_id))


def _problems(library, quest):
    patched = core.Library(
        root=library.root,
        world=library.world,
        objective_sets=library.objective_sets,
        diagrams=library.diagrams,
        quests=[quest],
    )
    return [str(problem) for problem in core.validate(patched, require_full_coverage=False)]


def test_two_correct_answers_are_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["options"][1]["correct"] = True
    quest.data["encounters"] = quest.encounters
    assert any("exactly one correct" in problem for problem in _problems(library, quest))


def test_a_wrong_answer_without_a_consequence_is_rejected(library):
    quest = _quest(library)
    del quest.encounters[0]["options"][1]["consequence"]
    quest.data["encounters"] = quest.encounters
    assert any("in-fiction consequence" in problem for problem in _problems(library, quest))


def test_a_correct_answer_that_costs_reputation_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["options"][0]["rep"] = -5
    quest.data["encounters"] = quest.encounters
    assert any("correct answer restores" in problem for problem in _problems(library, quest))


def test_an_undeclared_diagram_node_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["options"][0]["diagram"] = [{"op": "add_node", "node": "vnet-atlantis"}]
    quest.data["encounters"] = quest.encounters
    assert any("undeclared node" in problem for problem in _problems(library, quest))


def test_an_unknown_speaker_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["speaker"] = "Someone Nobody Hired"
    quest.data["encounters"] = quest.encounters
    assert any("not in the cast" in problem for problem in _problems(library, quest))


def test_an_overlong_beat_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["intro"] = "word " * 260
    quest.data["encounters"] = quest.encounters
    assert any("the limit is 250" in problem for problem in _problems(library, quest))


def test_en_gb_spelling_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["intro"] += " Check the authorisation settings in the centre pane."
    quest.data["encounters"] = quest.encounters
    problems = _problems(library, quest)
    assert any("authorisation" in problem for problem in problems)
    assert any("centre" in problem for problem in problems)


def test_an_objective_no_encounter_claims_is_rejected(library):
    quest = _quest(library)
    quest.objectives.append("AZ104-4.3.1")
    quest.data["objectives"] = quest.objectives
    assert any("no encounter claims it" in problem for problem in _problems(library, quest))


def test_an_impossible_time_budget_is_rejected(library):
    quest = _quest(library, "a1net-q02")
    quest.encounters[0]["time_budget"] = 3
    for command in quest.encounters[0]["commands"]:
        command["time_cost"] = 3
    quest.data["encounters"] = quest.encounters
    assert any("time_budget" in problem for problem in _problems(library, quest))


def test_a_made_up_diagnostic_tool_is_rejected(library):
    quest = _quest(library, "a1net-q02")
    quest.encounters[0]["commands"][0]["cmd"] = "sudo fix-the-network --now"
    quest.data["encounters"] = quest.encounters
    problems = _problems(library, quest)
    assert any("not a recognized diagnostic tool" in problem for problem in problems)


def _post_mortem():
    return {
        "question": "What did that change actually get wrong?",
        "options": [
            {
                "id": "a",
                "label": "It treated a routing gap as a security problem",
                "correct": True,
                "explain": "The traffic was allowed; it simply had no path to travel.",
            },
            {
                "id": "b",
                "label": "It used the wrong port range",
                "correct": False,
                "explain": "Ports were never in question; the flow log showed allowed traffic.",
            },
            {
                "id": "c",
                "label": "It should have gone through a change freeze",
                "correct": False,
                "explain": "Process was not the failure; the technical control chosen was.",
            },
        ],
    }


def test_a_post_mortem_with_two_lessons_is_rejected(library):
    quest = _quest(library)
    post_mortem = _post_mortem()
    post_mortem["options"][1]["correct"] = True
    quest.encounters[0]["post_mortem"] = post_mortem
    quest.data["encounters"] = quest.encounters
    assert any(
        "post_mortem must hold exactly one correct" in problem
        for problem in _problems(library, quest)
    )


def test_a_post_mortem_must_deal_three_answers(library):
    quest = _quest(library)
    post_mortem = _post_mortem()
    del post_mortem["options"][2]
    quest.encounters[0]["post_mortem"] = post_mortem
    quest.data["encounters"] = quest.encounters
    assert any("exactly 3 answers" in problem for problem in _problems(library, quest))


def test_a_post_incident_path_may_only_name_real_commands(library):
    quest = _quest(library, "a1net-q02")
    troubleshoot = next(e for e in quest.encounters if e["type"] == "troubleshoot")
    troubleshoot["post_incident"] = {
        "path": ["zz"],
        "text": "Two checks would have settled this, and neither was the reboot.",
    }
    quest.data["encounters"] = quest.encounters
    assert any(
        "post_incident.path names unknown command" in problem
        for problem in _problems(library, quest)
    )


def test_an_overlong_hint_is_rejected(library):
    quest = _quest(library)
    quest.encounters[0]["hint"] = "word " * 50
    quest.data["encounters"] = quest.encounters
    assert any("hint is 50 words" in problem for problem in _problems(library, quest))


def test_the_bundle_compiles_deterministically(library, tmp_path):
    first = core.build_bundle(library, tmp_path / "one")
    second = core.build_bundle(library, tmp_path / "two")
    assert first["version"] == second["version"]
    one = (tmp_path / "one" / "index.json").read_bytes()
    two = (tmp_path / "two" / "index.json").read_bytes()
    assert one == two


def test_the_bundle_carries_every_quest_and_the_legal_pages(library, tmp_path):
    core.build_bundle(library, tmp_path)
    index = json.loads((tmp_path / "index.json").read_text())
    assert len(index["chapters"]) == len(library.world["chapters"])
    assert {path.stem for path in (tmp_path / "quests").glob("*.json")} == {
        quest.id for quest in library.quests
    }
    assert (tmp_path / "legal" / "privacy.md").exists()


def test_the_right_answer_is_not_always_the_first_one(library):
    """Authors write the correct answer first; the bundle must not ship it there."""
    positions = collections.Counter()
    lists = 0
    for quest in library.quests:
        for encounter in core.deal_answers(quest)["encounters"]:
            for field_name in ("options", "fixes"):
                choices = encounter.get(field_name)
                if not choices:
                    continue
                lists += 1
                positions[next(i for i, c in enumerate(choices) if c.get("correct"))] += 1
    assert lists > 100
    # Every seat is used, and no seat holds more than a third of the answers.
    assert set(positions) == {0, 1, 2, 3}
    assert max(positions.values()) < lists / 3


def test_dealing_answers_is_stable_and_lossless(library):
    quest = next(q for q in library.quests if any("options" in e for e in q.encounters))
    first = core.deal_answers(quest)
    second = core.deal_answers(quest)
    assert first == second
    for authored, dealt in zip(quest.encounters, first["encounters"], strict=True):
        if "options" not in authored:
            continue
        assert sorted(o["id"] for o in dealt["options"]) == sorted(
            o["id"] for o in authored["options"]
        )
        # The authored file itself is never rewritten.
        assert authored["options"][0]["correct"] is True


def test_the_index_maps_every_encounter_to_its_objectives(library, tmp_path):
    """Review drills and save migration read objectives from the index alone."""
    core.build_bundle(library, tmp_path)
    index = json.loads((tmp_path / "index.json").read_text())
    summaries = {q["id"]: q for chapter in index["chapters"] for q in chapter["quests"]}
    for quest in library.quests:
        entries = summaries[quest.id]["encounters"]
        assert [entry["id"] for entry in entries] == [e["id"] for e in quest.encounters]
        for entry, encounter in zip(entries, quest.encounters, strict=True):
            assert entry["objectives"] == encounter.get("objectives", quest.objectives)
            assert entry["objectives"], f"{quest.id}/{entry['id']} covers nothing"


def test_post_mortem_answers_are_dealt_and_lossless(library):
    quest = _quest(library)
    quest.data["encounters"][0]["post_mortem"] = _post_mortem()
    first = core.deal_answers(quest)
    second = core.deal_answers(quest)
    assert first == second
    dealt = first["encounters"][0]["post_mortem"]["options"]
    assert sorted(option["id"] for option in dealt) == ["a", "b", "c"]
    # The authored dict itself keeps the correct answer first.
    assert quest.data["encounters"][0]["post_mortem"]["options"][0]["correct"] is True


def test_the_post_mortem_lesson_is_not_always_the_first_answer(library):
    positions = collections.Counter()
    lists = 0
    for quest in library.quests:
        for encounter in core.deal_answers(quest)["encounters"]:
            post_mortem = encounter.get("post_mortem")
            if not post_mortem:
                continue
            lists += 1
            positions[
                next(i for i, c in enumerate(post_mortem["options"]) if c.get("correct"))
            ] += 1
    if not lists:
        pytest.skip("no post-mortems authored yet")
    assert set(positions) == {0, 1, 2}
    assert max(positions.values()) < lists * 0.55


def test_schemas_are_valid_json(library):
    for path in (library.root / "schema").glob("*.json"):
        json.loads(path.read_text())


def test_world_and_objectives_parse_as_yaml(library):
    yaml.safe_load((library.root / "world.yaml").read_text())
