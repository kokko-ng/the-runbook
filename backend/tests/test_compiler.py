"""The compiled JSON is the engine's input contract; these tests pin its shape."""

import json

from content_pipeline.compiler import compile_quest, compile_tree
from content_pipeline.loader import load_tree
from tests.conftest import sample_quest


def test_defaults_are_resolved_at_compile_time():
    """The engine must never have to ask whether a field was omitted."""
    compiled = compile_quest(sample_quest())

    assert compiled["checkpoint"] is True
    assert compiled["role"] == "junior-cloud-admin"
    assert compiled["summary"] == ""
    assert "bonusVariantOf" not in compiled

    decision = compiled["encounters"][0]
    assert decision["onEnterDiagramOps"] == []
    assert decision["options"][1]["diagramOps"] == []
    assert decision["rewards"] == {}

    incident = compiled["encounters"][1]
    assert incident["investigate"][0]["timeCost"] == 0
    assert incident["investigate"][0]["speaker"] == "narrator"
    # label falls back to the command text so the menu always has something to show
    assert incident["commands"][0]["label"] == incident["commands"][0]["command"]
    assert incident["commands"][0]["note"] == ""


def test_snake_case_becomes_camel_case():
    quest = sample_quest()
    quest["encounters"][1]["rewards"] = {"under_budget_bonus": 4, "skill_points": 1}
    compiled = compile_quest(quest)
    assert compiled["encounters"][1]["rewards"] == {"underBudgetBonus": 4, "skillPoints": 1}
    assert compiled["encounters"][1]["timeBudget"] == 4


def test_authored_rewards_survive_and_unset_ones_are_omitted():
    quest = sample_quest()
    quest["encounters"][0]["rewards"] = {"rep_penalty": 12}
    compiled = compile_quest(quest)
    assert compiled["encounters"][0]["rewards"] == {"repPenalty": 12}


def test_bonus_variant_is_emitted():
    quest = sample_quest()
    quest["bonus_variant_of"] = "test-quest"
    assert compile_quest(quest)["bonusVariantOf"] == "test-quest"


def test_compile_tree_writes_manifest_and_quests(content_root, tmp_path):
    out = tmp_path / "generated"
    summary = compile_tree(load_tree(content_root), out)

    assert summary == {"quests": 1, "chapters": 1}
    assert (out / "quests" / "test-quest.json").is_file()

    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["formatVersion"] == 1
    assert manifest["chapters"][0]["quests"] == ["test-quest"]
    assert manifest["quests"][0]["objectives"] == ["AZ104-1.1", "AZ104-1.2"]
    assert manifest["diagrams"]["1"]["nodes"][0]["status"] == "healthy"
    assert manifest["coverage"]["AZ104-1.1"] == ["test-quest:e1"]


def test_stale_quest_files_are_removed(content_root, tmp_path):
    out = tmp_path / "generated"
    (out / "quests").mkdir(parents=True)
    (out / "quests" / "deleted-quest.json").write_text("{}")

    compile_tree(load_tree(content_root), out)
    assert not (out / "quests" / "deleted-quest.json").exists()


def test_real_content_compiles(settings, tmp_path):
    summary = compile_tree(load_tree(settings.CONTENT_DIR), tmp_path / "out")
    assert summary["quests"] > 0
