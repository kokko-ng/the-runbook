"""Compile the YAML content tree into the JSON the SPA ships in its bundle.

Output layout (``frontend/src/generated/content/``)::

    manifest.json      acts, chapters, quest index, objective registry, base diagrams
    quests/<id>.json   one file per quest, dynamically imported at play time

Defaults are resolved here rather than in the engine, so the runtime never has to
ask "was this field omitted?". Anything the engine reads is present in the JSON.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .coverage import build_coverage
from .loader import ContentTree
from .validator import ObjectiveRegistry, _act_from_diagram_id

CONTENT_FORMAT_VERSION = 1


def _compile_option(option: dict[str, Any]) -> dict[str, Any]:
    compiled = {
        "id": option["id"],
        "label": option["label"],
        "correct": option["correct"],
        "explain": option["explain"],
        "diagramOps": _compile_ops(option.get("diagram_ops", [])),
    }
    if "consequence" in option:
        compiled["consequence"] = option["consequence"]
    if "rep" in option:
        compiled["rep"] = option["rep"]
    return compiled


def _compile_ops(ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compiled: list[dict[str, Any]] = []
    for op in ops:
        if op["op"] == "add_node":
            compiled.append({"op": "add_node", "node": _compile_node(op["node"])})
        elif op["op"] == "add_edge":
            compiled.append({"op": "add_edge", "edge": _compile_edge(op["edge"])})
        else:
            compiled.append(dict(op))
    return compiled


def _compile_node(node: dict[str, Any]) -> dict[str, Any]:
    compiled = {
        "id": node["id"],
        "label": node["label"],
        "kind": node["kind"],
        "status": node.get("status", "healthy"),
    }
    for optional in ("group", "note", "position"):
        if optional in node:
            compiled[optional] = node[optional]
    return compiled


def _compile_edge(edge: dict[str, Any]) -> dict[str, Any]:
    compiled = {
        "id": edge["id"],
        "source": edge["source"],
        "target": edge["target"],
        "kind": edge.get("kind", "dependency"),
        "status": edge.get("status", "healthy"),
    }
    if "label" in edge:
        compiled["label"] = edge["label"]
    return compiled


def _compile_encounter(encounter: dict[str, Any]) -> dict[str, Any]:
    compiled: dict[str, Any] = {
        "id": encounter["id"],
        "type": encounter["type"],
        "title": encounter.get("title", ""),
        "objectives": list(encounter["objectives"]),
        "next": encounter["next"],
        "onEnterDiagramOps": _compile_ops(encounter.get("on_enter_diagram_ops", [])),
        "rewards": _compile_rewards(encounter.get("rewards", {})),
    }
    if "scenario" in encounter:
        compiled["scenario"] = encounter["scenario"].rstrip()
    if "speaker" in encounter:
        compiled["speaker"] = encounter["speaker"]

    if encounter["type"] == "design_decision":
        compiled["prompt"] = encounter.get("prompt", "")
        compiled["options"] = [_compile_option(option) for option in encounter["options"]]
    elif encounter["type"] == "knowledge_check":
        compiled["question"] = encounter["question"]
        compiled["options"] = [_compile_option(option) for option in encounter["options"]]
    else:
        if "ticket" in encounter:
            ticket = encounter["ticket"]
            compiled["ticket"] = {
                "id": ticket["id"],
                "reporter": ticket["reporter"],
                "priority": ticket.get("priority", "P3"),
                "opened": ticket.get("opened", ""),
                "body": ticket["body"].rstrip(),
            }
        compiled["timeBudget"] = encounter["time_budget"]
        compiled["investigate"] = [
            {
                "id": action["id"],
                "label": action["label"],
                "reveals": action["reveals"].rstrip(),
                "speaker": action.get("speaker", "narrator"),
                "timeCost": action.get("time_cost", 0),
            }
            for action in encounter["investigate"]
        ]
        compiled["commands"] = [
            {
                "id": command["id"],
                "label": command.get("label", command["command"]),
                "command": command["command"],
                "output": command["output"].rstrip("\n"),
                "timeCost": command["time_cost"],
                "note": command.get("note", ""),
            }
            for command in encounter["commands"]
        ]
        compiled["fixes"] = [_compile_option(option) for option in encounter["fixes"]]

    return compiled


def _compile_rewards(rewards: dict[str, Any]) -> dict[str, Any]:
    """Only authored overrides are emitted; the engine supplies the defaults."""
    mapping = {
        "rep_bonus": "repBonus",
        "rep_penalty": "repPenalty",
        "under_budget_bonus": "underBudgetBonus",
        "time_penalty": "timePenalty",
        "skill_points": "skillPoints",
    }
    return {mapping[key]: value for key, value in rewards.items() if key in mapping}


def compile_quest(quest: dict[str, Any]) -> dict[str, Any]:
    compiled: dict[str, Any] = {
        "id": quest["id"],
        "title": quest["title"],
        "act": quest["act"],
        "chapter": quest["chapter"],
        "domain": quest["domain"],
        "order": quest.get("order", 1),
        "role": quest.get("role", "junior-cloud-admin"),
        "checkpoint": quest.get("checkpoint", True),
        "summary": quest.get("summary", ""),
        "entry": quest["entry"],
        "encounters": [_compile_encounter(encounter) for encounter in quest["encounters"]],
    }
    if "bonus_variant_of" in quest:
        compiled["bonusVariantOf"] = quest["bonus_variant_of"]
    return compiled


def _compile_manifest(tree: ContentTree) -> dict[str, Any]:
    registry = ObjectiveRegistry(tree.objectives)
    coverage = build_coverage(tree)

    exams = []
    for exam in registry.exams:
        exams.append(
            {
                "exam": exam["exam"],
                "title": exam["title"],
                "act": exam["act"],
                "sourceUrl": exam.get("source_url", ""),
                "fetchedOn": exam.get("fetched_on", ""),
                "domains": [
                    {
                        "id": domain["id"],
                        "title": domain["title"],
                        "chapter": domain["chapter"],
                        "weight": domain.get("weight", ""),
                        "clusters": [
                            {
                                "id": cluster["id"],
                                "title": cluster["title"],
                                "requires": cluster.get("requires", []),
                                "objectives": [
                                    {"id": obj["id"], "text": obj["text"]}
                                    for obj in cluster["objectives"]
                                ],
                            }
                            for cluster in domain["clusters"]
                        ],
                    }
                    for domain in exam["domains"]
                ],
            }
        )

    diagrams = {}
    for item in tree.diagrams:
        data = item.data
        diagrams[str(_act_from_diagram_id(data["id"]))] = {
            "id": data["id"],
            "title": data.get("title", ""),
            "groups": [dict(group) for group in data.get("groups", [])],
            "nodes": [_compile_node(node) for node in data.get("nodes", [])],
            "edges": [_compile_edge(edge) for edge in data.get("edges", [])],
        }

    quests = sorted(
        (item.data for item in tree.quests),
        key=lambda quest: (quest["act"], quest["chapter"], quest.get("order", 1), quest["id"]),
    )

    chapters: dict[str, dict[str, Any]] = {}
    for exam in registry.exams:
        for domain in exam["domains"]:
            chapters[domain["chapter"]] = {
                "id": domain["chapter"],
                "act": exam["act"],
                "title": domain["title"],
                "domain": domain["id"],
                "quests": [],
            }
    for quest in quests:
        chapter = chapters.get(quest["chapter"])
        if chapter is None:
            continue
        chapter["quests"].append(quest["id"])

    return {
        "formatVersion": CONTENT_FORMAT_VERSION,
        "exams": exams,
        "chapters": [
            chapters[key]
            for key in sorted(chapters, key=lambda k: (chapters[k]["act"], chapters[k]["id"]))
        ],
        "quests": [
            {
                "id": quest["id"],
                "title": quest["title"],
                "act": quest["act"],
                "chapter": quest["chapter"],
                "domain": quest["domain"],
                "order": quest.get("order", 1),
                "role": quest.get("role", "junior-cloud-admin"),
                "summary": quest.get("summary", ""),
                "checkpoint": quest.get("checkpoint", True),
                "bonusVariantOf": quest.get("bonus_variant_of"),
                "objectives": sorted(
                    {
                        objective
                        for encounter in quest["encounters"]
                        for objective in encounter["objectives"]
                    }
                ),
            }
            for quest in quests
        ],
        "diagrams": diagrams,
        "coverage": {
            objective_id: encounters
            for domain in coverage.domains
            for objective_id, encounters in domain.objectives.items()
        },
    }


def compile_tree(tree: ContentTree, out_dir: Path) -> dict[str, int]:
    """Write manifest.json and quests/<id>.json. Returns a count summary."""
    quests_dir = out_dir / "quests"
    quests_dir.mkdir(parents=True, exist_ok=True)

    # Remove stale quest files so a renamed or deleted quest cannot linger.
    for stale in quests_dir.glob("*.json"):
        stale.unlink()

    manifest = _compile_manifest(tree)
    _write_json(out_dir / "manifest.json", manifest)

    for item in tree.quests:
        compiled = compile_quest(item.data)
        _write_json(quests_dir / f"{compiled['id']}.json", compiled)

    return {"quests": len(tree.quests), "chapters": len(manifest["chapters"])}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False, sort_keys=False)
        handle.write("\n")
