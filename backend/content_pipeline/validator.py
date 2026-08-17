"""Schema and semantic validation for the content tree.

Two layers run over every file:

1. JSON Schema (``content/schema/*.schema.json``) checks shape.
2. Semantic lint checks the things a schema cannot: reference integrity across
   files, exactly one correct option, reachability and termination of the
   encounter graph, diagram ops that name declared nodes, prose length.

Both layers report through a single :class:`Problem` list so ``validate_content``
can print every failure in one pass rather than one per run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .loader import ContentTree, LoadedFile, load_schema

MAX_SCENARIO_WORDS = 250
END = "END"

# Statuses a node may hold; mirrors diagram.schema.json.
STATUSES = {"healthy", "warning", "broken", "degraded", "planned"}


@dataclass(frozen=True)
class Problem:
    path: Path
    message: str
    where: str = ""

    def __str__(self) -> str:
        location = f" [{self.where}]" if self.where else ""
        return f"{self.path}{location}: {self.message}"


def _word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def _schema_registry(schema_dir: Path) -> Registry:
    """Registry so quest.schema.json can $ref diagram.schema.json by filename."""
    registry = Registry()
    for name in ("quest.schema.json", "diagram.schema.json", "objectives.schema.json"):
        schema = load_schema(schema_dir, name)
        resource = Resource.from_contents(schema)
        registry = registry.with_resource(uri=name, resource=resource)
        if "$id" in schema:
            registry = registry.with_resource(uri=schema["$id"], resource=resource)
    return registry


def _validate_schema(
    files: Iterable[LoadedFile], schema: dict[str, Any], registry: Registry
) -> list[Problem]:
    validator = Draft202012Validator(schema, registry=registry)
    problems: list[Problem] = []
    for item in files:
        for error in sorted(validator.iter_errors(item.data), key=lambda e: list(e.path)):
            where = "/".join(str(part) for part in error.absolute_path) or "<root>"
            problems.append(Problem(item.path, error.message, where))
    return problems


class ObjectiveRegistry:
    """Flattened view of every objective registry: lookups the linter needs."""

    def __init__(self, files: Iterable[LoadedFile]):
        self.objectives: dict[str, str] = {}
        self.objective_cluster: dict[str, str] = {}
        self.cluster_objectives: dict[str, list[str]] = {}
        self.cluster_titles: dict[str, str] = {}
        self.domains: dict[str, dict[str, Any]] = {}
        self.exams: list[dict[str, Any]] = []
        # Chapters are played in the order their domains are declared, which is
        # the exam's own order - not alphabetically by slug.
        self.chapter_order: dict[str, int] = {}

        for item in files:
            data = item.data
            self.exams.append(data)
            for domain in data.get("domains", []):
                self.chapter_order.setdefault(domain["chapter"], len(self.chapter_order))
                self.domains[domain["id"]] = domain
                for cluster in domain.get("clusters", []):
                    ids = [obj["id"] for obj in cluster.get("objectives", [])]
                    self.cluster_objectives[cluster["id"]] = ids
                    self.cluster_titles[cluster["id"]] = cluster["title"]
                    for obj in cluster.get("objectives", []):
                        self.objectives[obj["id"]] = obj["text"]
                        self.objective_cluster[obj["id"]] = cluster["id"]

    def __contains__(self, objective_id: str) -> bool:
        return objective_id in self.objectives


def _check_registry_uniqueness(files: list[LoadedFile]) -> list[Problem]:
    problems: list[Problem] = []
    seen_objectives: dict[str, Path] = {}
    seen_clusters: dict[str, Path] = {}
    seen_domains: dict[str, Path] = {}
    for item in files:
        for domain in item.data.get("domains", []):
            if domain["id"] in seen_domains:
                problems.append(
                    Problem(item.path, f"duplicate domain id {domain['id']}", domain["id"])
                )
            seen_domains[domain["id"]] = item.path
            for cluster in domain.get("clusters", []):
                if cluster["id"] in seen_clusters:
                    problems.append(
                        Problem(item.path, f"duplicate cluster id {cluster['id']}", cluster["id"])
                    )
                seen_clusters[cluster["id"]] = item.path
                for require in cluster.get("requires", []):
                    if require == cluster["id"]:
                        problems.append(
                            Problem(item.path, "cluster requires itself", cluster["id"])
                        )
                for obj in cluster.get("objectives", []):
                    if obj["id"] in seen_objectives:
                        problems.append(
                            Problem(item.path, f"duplicate objective id {obj['id']}", obj["id"])
                        )
                    seen_objectives[obj["id"]] = item.path

    # requires must name a declared cluster
    for item in files:
        for domain in item.data.get("domains", []):
            for cluster in domain.get("clusters", []):
                for require in cluster.get("requires", []):
                    if require not in seen_clusters:
                        problems.append(
                            Problem(
                                item.path,
                                f"cluster requires undeclared cluster {require}",
                                cluster["id"],
                            )
                        )
    return problems


class DiagramIndex:
    """Node and edge ids declared by the base diagrams, per act."""

    def __init__(self, files: Iterable[LoadedFile]):
        self.by_act: dict[int, dict[str, set[str]]] = {}
        self.diagrams: dict[str, dict[str, Any]] = {}
        for item in files:
            data = item.data
            self.diagrams[data["id"]] = data
            act = _act_from_diagram_id(data["id"])
            entry = self.by_act.setdefault(act, {"nodes": set(), "edges": set(), "groups": set()})
            entry["nodes"].update(node["id"] for node in data.get("nodes", []))
            entry["edges"].update(edge["id"] for edge in data.get("edges", []))
            entry["groups"].update(group["id"] for group in data.get("groups", []))

    def nodes(self, act: int) -> set[str]:
        return set(self.by_act.get(act, {}).get("nodes", set()))

    def edges(self, act: int) -> set[str]:
        return set(self.by_act.get(act, {}).get("edges", set()))


def _act_from_diagram_id(diagram_id: str) -> int:
    match = re.match(r"act(\d+)", diagram_id)
    return int(match.group(1)) if match else 1


def _check_diagram_internals(files: list[LoadedFile]) -> list[Problem]:
    problems: list[Problem] = []
    for item in files:
        data = item.data
        node_ids = {node["id"] for node in data.get("nodes", [])}
        group_ids = {group["id"] for group in data.get("groups", [])}
        seen: set[str] = set()
        for node in data.get("nodes", []):
            if node["id"] in seen:
                problems.append(Problem(item.path, f"duplicate node id {node['id']}"))
            seen.add(node["id"])
            if "group" in node and node["group"] not in group_ids:
                problems.append(
                    Problem(item.path, f"node references undeclared group {node['group']}", node["id"])
                )
        seen_edges: set[str] = set()
        for edge in data.get("edges", []):
            if edge["id"] in seen_edges:
                problems.append(Problem(item.path, f"duplicate edge id {edge['id']}"))
            seen_edges.add(edge["id"])
            for end in ("source", "target"):
                if edge[end] not in node_ids:
                    problems.append(
                        Problem(
                            item.path,
                            f"edge {end} names undeclared node {edge[end]}",
                            edge["id"],
                        )
                    )
    return problems


def _options_of(encounter: dict[str, Any]) -> list[dict[str, Any]]:
    if encounter["type"] == "troubleshoot":
        return encounter.get("fixes", [])
    return encounter.get("options", [])


def _all_diagram_ops(encounter: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    ops: list[tuple[str, dict[str, Any]]] = []
    for op in encounter.get("on_enter_diagram_ops", []):
        ops.append(("on_enter", op))
    for option in _options_of(encounter):
        for op in option.get("diagram_ops", []):
            ops.append((option["id"], op))
    return ops


def _check_quest(
    item: LoadedFile,
    registry: ObjectiveRegistry,
    available_nodes: set[str],
    available_edges: set[str],
    quest_ids: set[str],
) -> list[Problem]:
    data = item.data
    problems: list[Problem] = []
    quest_id = data["id"]

    if item.path.stem != quest_id:
        problems.append(
            Problem(item.path, f"quest id {quest_id} does not match filename {item.path.stem}")
        )

    if data["domain"] not in registry.domains:
        problems.append(Problem(item.path, f"undeclared domain {data['domain']}"))
    elif registry.domains[data["domain"]]["chapter"] != data["chapter"]:
        problems.append(
            Problem(
                item.path,
                f"chapter {data['chapter']} does not match domain "
                f"{data['domain']} chapter {registry.domains[data['domain']]['chapter']}",
            )
        )

    if "bonus_variant_of" in data and data["bonus_variant_of"] not in quest_ids:
        problems.append(
            Problem(item.path, f"bonus_variant_of names unknown quest {data['bonus_variant_of']}")
        )

    encounters = data["encounters"]
    by_id: dict[str, dict[str, Any]] = {}
    for encounter in encounters:
        if encounter["id"] in by_id:
            problems.append(Problem(item.path, f"duplicate encounter id {encounter['id']}"))
        by_id[encounter["id"]] = encounter

    if data["entry"] not in by_id:
        problems.append(Problem(item.path, f"entry names unknown encounter {data['entry']}"))

    # Node ids available to this quest's diagram ops: the base diagram plus
    # everything earlier quests in the act add (accumulated by the caller), plus
    # anything this quest adds. Ops within a quest are validated against the
    # union because the player may reach encounters in any order the graph allows.
    for encounter in encounters:
        for _, op in _all_diagram_ops(encounter):
            if op["op"] == "add_node":
                available_nodes.add(op["node"]["id"])
            elif op["op"] == "add_edge":
                available_edges.add(op["edge"]["id"])

    for encounter in encounters:
        where = encounter["id"]

        for objective_id in encounter["objectives"]:
            if objective_id not in registry:
                problems.append(
                    Problem(item.path, f"unknown objective {objective_id}", where)
                )

        scenario = encounter.get("scenario") or ""
        if scenario and _word_count(scenario) > MAX_SCENARIO_WORDS:
            problems.append(
                Problem(
                    item.path,
                    f"scenario is {_word_count(scenario)} words, limit is {MAX_SCENARIO_WORDS}",
                    where,
                )
            )

        options = _options_of(encounter)
        correct = [option for option in options if option["correct"]]
        if len(correct) != 1:
            problems.append(
                Problem(item.path, f"expected exactly 1 correct option, found {len(correct)}", where)
            )
        option_ids = [option["id"] for option in options]
        if len(set(option_ids)) != len(option_ids):
            problems.append(Problem(item.path, "duplicate option ids", where))

        if encounter["next"] != END and encounter["next"] not in by_id:
            problems.append(
                Problem(item.path, f"next names unknown encounter {encounter['next']}", where)
            )

        if encounter["type"] == "troubleshoot":
            problems.extend(_check_troubleshoot(item, encounter, where))

        for source, op in _all_diagram_ops(encounter):
            problems.extend(
                _check_diagram_op(item, op, available_nodes, available_edges, f"{where}/{source}")
            )

    problems.extend(_check_graph(item, data, by_id))
    return problems


def _status_changes(ops: list[dict[str, Any]]) -> dict[tuple[str, str], str]:
    """Final status per target after applying ops in order: {(kind, id): status}."""
    result: dict[tuple[str, str], str] = {}
    for op in ops:
        if op["op"] == "set_status":
            result[("node", op["node"])] = op["status"]
        elif op["op"] == "set_edge_status":
            result[("edge", op["edge"])] = op["status"]
        elif op["op"] == "add_node":
            result[("node", op["node"]["id"])] = op["node"].get("status", "healthy")
        elif op["op"] == "add_edge":
            result[("edge", op["edge"]["id"])] = op["edge"].get("status", "healthy")
    return result


def _check_incident_repairs(
    item: LoadedFile, encounter: dict[str, Any], where: str
) -> list[Problem]:
    """An incident that reddens the map must have a fix that clears it.

    Without this, a quest leaves permanent damage that every later quest
    inherits, and the living map stops meaning anything.
    """
    problems: list[Problem] = []

    broken = {
        target: status
        for target, status in _status_changes(encounter.get("on_enter_diagram_ops", [])).items()
        if status in {"broken", "warning", "degraded"}
    }
    if not broken:
        problems.append(
            Problem(
                item.path,
                "troubleshoot encounter changes nothing on the map; the incident is invisible",
                where,
            )
        )
        return problems

    correct = next((fix for fix in encounter.get("fixes", []) if fix["correct"]), None)
    if correct is None:
        return problems

    repaired = _status_changes(correct.get("diagram_ops", []))
    for target, status in sorted(broken.items()):
        kind, target_id = target
        if repaired.get(target) != "healthy":
            problems.append(
                Problem(
                    item.path,
                    f"the fix leaves {kind} {target_id} {status}; "
                    "the correct fix must return everything the incident broke to healthy",
                    where,
                )
            )
    return problems


def _check_troubleshoot(
    item: LoadedFile, encounter: dict[str, Any], where: str
) -> list[Problem]:
    problems: list[Problem] = _check_incident_repairs(item, encounter, where)
    budget = encounter["time_budget"]
    commands = encounter.get("commands", [])

    cheapest = min((command["time_cost"] for command in commands), default=0)
    if cheapest > budget:
        problems.append(
            Problem(item.path, "time_budget cannot afford even the cheapest command", where)
        )

    ids = [command["id"] for command in commands]
    if len(set(ids)) != len(ids):
        problems.append(Problem(item.path, "duplicate command ids", where))

    action_ids = [action["id"] for action in encounter.get("investigate", [])]
    if len(set(action_ids)) != len(action_ids):
        problems.append(Problem(item.path, "duplicate investigate action ids", where))

    return problems


def _check_diagram_op(
    item: LoadedFile,
    op: dict[str, Any],
    nodes: set[str],
    edges: set[str],
    where: str,
) -> list[Problem]:
    kind = op["op"]
    problems: list[Problem] = []
    if kind in {"set_status", "remove_node", "set_label"}:
        if op["node"] not in nodes:
            problems.append(
                Problem(item.path, f"{kind} names undeclared node {op['node']}", where)
            )
    elif kind in {"set_edge_status", "remove_edge"}:
        if op["edge"] not in edges:
            problems.append(
                Problem(item.path, f"{kind} names undeclared edge {op['edge']}", where)
            )
    elif kind == "add_edge":
        edge = op["edge"]
        for end in ("source", "target"):
            if edge[end] not in nodes:
                problems.append(
                    Problem(
                        item.path,
                        f"add_edge {end} names undeclared node {edge[end]}",
                        where,
                    )
                )
    return problems


def _check_graph(
    item: LoadedFile, data: dict[str, Any], by_id: dict[str, dict[str, Any]]
) -> list[Problem]:
    """Every encounter reachable from entry, and every path terminates at END."""
    problems: list[Problem] = []
    entry = data["entry"]
    if entry not in by_id:
        return problems

    reachable: set[str] = set()
    stack = [entry]
    while stack:
        current = stack.pop()
        if current in reachable or current == END:
            continue
        reachable.add(current)
        nxt = by_id[current]["next"]
        if nxt != END and nxt in by_id:
            stack.append(nxt)

    for encounter_id in by_id:
        if encounter_id not in reachable:
            problems.append(
                Problem(item.path, "encounter is unreachable from entry", encounter_id)
            )

    # A cycle that never reaches END is a dead end for the player.
    terminates: set[str] = set()
    for start in reachable:
        seen: set[str] = set()
        current = start
        while True:
            if current == END:
                terminates.add(start)
                break
            if current in terminates:
                terminates.add(start)
                break
            if current in seen or current not in by_id:
                break
            seen.add(current)
            current = by_id[current]["next"]

    for encounter_id in sorted(reachable - terminates):
        problems.append(
            Problem(item.path, "no path from this encounter reaches END", encounter_id)
        )

    return problems


def validate(tree: ContentTree) -> list[Problem]:
    """Run every check over a loaded content tree, returning all problems found."""
    registry_schemas = _schema_registry(tree.schema_dir)
    problems: list[Problem] = []

    problems += _validate_schema(
        tree.objectives, load_schema(tree.schema_dir, "objectives.schema.json"), registry_schemas
    )
    problems += _validate_schema(
        tree.diagrams, load_schema(tree.schema_dir, "diagram.schema.json"), registry_schemas
    )
    problems += _validate_schema(
        tree.quests, load_schema(tree.schema_dir, "quest.schema.json"), registry_schemas
    )

    # Semantic checks assume schema-valid input; bail out early if it is not.
    if problems:
        return problems

    problems += _check_registry_uniqueness(tree.objectives)
    problems += _check_diagram_internals(tree.diagrams)

    objectives = ObjectiveRegistry(tree.objectives)
    diagrams = DiagramIndex(tree.diagrams)
    quest_ids = {item.data["id"] for item in tree.quests}

    seen_quest_ids: set[str] = set()
    for item in tree.quests:
        if item.data["id"] in seen_quest_ids:
            problems.append(Problem(item.path, f"duplicate quest id {item.data['id']}"))
        seen_quest_ids.add(item.data["id"])

    # Walk quests in play order per act, carrying the diagram forward: a quest may
    # reference any node the base diagram declares or an earlier quest adds, but
    # not one that only appears later in the act.
    available: dict[int, tuple[set[str], set[str]]] = {}
    for item in sorted(tree.quests, key=lambda i: _play_order(i, objectives.chapter_order)):
        act = item.data["act"]
        if act not in available:
            available[act] = (diagrams.nodes(act), diagrams.edges(act))
        nodes, edges = available[act]
        problems += _check_quest(item, objectives, nodes, edges, quest_ids)
        for encounter in item.data["encounters"]:
            for _, op in _all_diagram_ops(encounter):
                if op["op"] == "add_node":
                    nodes.add(op["node"]["id"])
                elif op["op"] == "add_edge":
                    edges.add(op["edge"]["id"])

    return problems


def _play_order(item: LoadedFile, chapter_order: dict[str, int]) -> tuple[int, int, int, int, str]:
    """Sort key matching the order a player meets quests.

    Chapters follow the order their domains are declared in the objective
    registry, which is the exam's own order rather than alphabetical. Bonus
    variants sort immediately after the quest they vary, so they can use
    anything their parent introduced.
    """
    data = item.data
    return (
        data["act"],
        chapter_order.get(data["chapter"], 999),
        data.get("order", 1),
        1 if "bonus_variant_of" in data else 0,
        data["id"],
    )
