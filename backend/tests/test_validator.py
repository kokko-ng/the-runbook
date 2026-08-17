"""Each test breaks the fixture tree in exactly one way and asserts the linter says so."""

import pytest

from content_pipeline.loader import load_tree
from content_pipeline.validator import validate
from tests.conftest import sample_quest


def problems_for(root):
    return [str(problem) for problem in validate(load_tree(root))]


def test_clean_tree_has_no_problems(content_root):
    assert problems_for(content_root) == []


def test_two_correct_options_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["options"][1]["correct"] = True
    root = write_quest(quest)
    assert any("exactly 1 correct option, found 2" in p for p in problems_for(root))


def test_no_correct_option_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["options"][0]["correct"] = False
    root = write_quest(quest)
    assert any("exactly 1 correct option, found 0" in p for p in problems_for(root))


def test_next_pointing_at_unknown_encounter_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["next"] = "e-nowhere"
    root = write_quest(quest)
    assert any("next names unknown encounter e-nowhere" in p for p in problems_for(root))


def test_unreachable_encounter_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["next"] = "END"
    root = write_quest(quest)
    assert any("unreachable from entry" in p for p in problems_for(root))


def test_dead_end_cycle_rejected(write_quest):
    """A loop that never reaches END traps the player."""
    quest = sample_quest()
    quest["encounters"][1]["next"] = "e1"
    root = write_quest(quest)
    assert any("no path from this encounter reaches END" in p for p in problems_for(root))


def test_unknown_objective_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["objectives"] = ["AZ104-9.9"]
    root = write_quest(quest)
    assert any("unknown objective AZ104-9.9" in p for p in problems_for(root))


def test_diagram_op_on_undeclared_node_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["options"][0]["diagram_ops"] = [
        {"op": "set_status", "node": "vnet-imaginary", "status": "broken"}
    ]
    root = write_quest(quest)
    assert any("undeclared node vnet-imaginary" in p for p in problems_for(root))


def test_node_added_by_earlier_quest_is_available_later(write_quest):
    """Quest 2 may reference a node quest 1 adds; play order carries the diagram forward."""
    first = sample_quest()
    first["encounters"][0]["options"][0]["diagram_ops"] = [
        {"op": "add_node", "node": {"id": "vnet-new", "label": "New", "kind": "vnet"}}
    ]
    write_quest(first)

    second = sample_quest()
    second["id"] = "test-quest-two"
    second["order"] = 2
    second["encounters"][0]["options"][0]["diagram_ops"] = [
        {"op": "set_status", "node": "vnet-new", "status": "broken"}
    ]
    root = write_quest(second)
    assert problems_for(root) == []


def test_node_added_by_later_quest_is_not_available_earlier(write_quest):
    first = sample_quest()
    first["encounters"][0]["options"][0]["diagram_ops"] = [
        {"op": "set_status", "node": "vnet-later", "status": "broken"}
    ]
    write_quest(first)

    second = sample_quest()
    second["id"] = "test-quest-two"
    second["order"] = 2
    second["encounters"][0]["options"][0]["diagram_ops"] = [
        {"op": "add_node", "node": {"id": "vnet-later", "label": "Later", "kind": "vnet"}}
    ]
    root = write_quest(second)
    assert any("undeclared node vnet-later" in p for p in problems_for(root))


def test_scenario_over_word_limit_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][0]["scenario"] = "word " * 251
    root = write_quest(quest)
    assert any("limit is 250" in p for p in problems_for(root))


def test_quest_id_must_match_filename(content_root):
    path = content_root / "quests" / "test-quest.yaml"
    path.write_text(path.read_text().replace("id: test-quest", "id: renamed-quest"), "utf-8")
    assert any("does not match filename" in p for p in problems_for(content_root))


def test_chapter_must_match_domain(write_quest):
    quest = sample_quest()
    quest["chapter"] = "wrong-chapter"
    root = write_quest(quest)
    assert any("does not match domain" in p for p in problems_for(root))


def test_incident_that_breaks_nothing_on_the_map_rejected(write_quest):
    """An incident the player cannot see is a missed teaching opportunity."""
    quest = sample_quest()
    quest["encounters"][1].pop("on_enter_diagram_ops", None)
    root = write_quest(quest)
    assert any("the incident is invisible" in p for p in problems_for(root))


def test_incident_with_no_repairing_fix_rejected(write_quest):
    """Damage no fix clears would be inherited by every later quest."""
    quest = sample_quest()
    quest["encounters"][1]["fixes"][0]["diagram_ops"] = []
    root = write_quest(quest)
    assert any("leaves node vnet-spoke broken" in p for p in problems_for(root))


def test_incident_repaired_by_the_correct_fix_accepted(write_quest):
    quest = sample_quest()
    quest["encounters"][1]["on_enter_diagram_ops"] = [
        {"op": "set_status", "node": "vnet-spoke", "status": "broken"}
    ]
    quest["encounters"][1]["fixes"][0]["diagram_ops"] = [
        {"op": "set_status", "node": "vnet-spoke", "status": "healthy"}
    ]
    root = write_quest(quest)
    assert problems_for(root) == []


def test_repair_on_a_wrong_fix_does_not_count(write_quest):
    """Only the correct resolution may clear the incident."""
    quest = sample_quest()
    # Move the repair from the correct fix onto a wrong one.
    quest["encounters"][1]["fixes"][0]["diagram_ops"] = []
    quest["encounters"][1]["fixes"][1]["diagram_ops"] = [
        {"op": "set_status", "node": "vnet-spoke", "status": "healthy"}
    ]
    root = write_quest(quest)
    assert any("leaves node vnet-spoke broken" in p for p in problems_for(root))


def test_time_budget_below_cheapest_command_rejected(write_quest):
    quest = sample_quest()
    quest["encounters"][1]["time_budget"] = 1
    quest["encounters"][1]["commands"][0]["time_cost"] = 2
    root = write_quest(quest)
    assert any("cannot afford even the cheapest command" in p for p in problems_for(root))


def test_missing_explanation_rejected_by_schema(write_quest):
    quest = sample_quest()
    del quest["encounters"][0]["options"][1]["explain"]
    root = write_quest(quest)
    assert any("explain" in p for p in problems_for(root))


def test_troubleshoot_fields_rejected_on_design_decision(write_quest):
    """Type-specific fields must not leak across encounter types."""
    quest = sample_quest()
    quest["encounters"][0]["time_budget"] = 5
    root = write_quest(quest)
    assert problems_for(root) != []


def test_bonus_variant_must_name_a_real_quest(write_quest):
    quest = sample_quest()
    quest["id"] = "test-quest-bonus"
    quest["bonus_variant_of"] = "no-such-quest"
    root = write_quest(quest)
    assert any("names unknown quest no-such-quest" in p for p in problems_for(root))


@pytest.mark.parametrize("field", ["entry", "encounters", "domain"])
def test_required_top_level_fields(write_quest, field):
    quest = sample_quest()
    del quest[field]
    root = write_quest(quest)
    assert problems_for(root) != []
