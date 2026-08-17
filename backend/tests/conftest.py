import shutil
from pathlib import Path

import pytest
import yaml
from django.conf import settings

FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def content_root(tmp_path):
    """A minimal but valid content tree, copied so tests can mutate it freely.

    Schemas are the real ones from content/schema so tests exercise the shipped
    contract rather than a copy that can drift.
    """
    root = tmp_path / "content"
    (root / "objectives").mkdir(parents=True)
    (root / "diagrams").mkdir(parents=True)
    (root / "quests").mkdir(parents=True)
    shutil.copytree(settings.CONTENT_DIR / "schema", root / "schema")

    _write(
        root / "objectives" / "test.yaml",
        {
            "schema_version": 1,
            "exam": "az104",
            "title": "Test exam",
            "act": 1,
            "domains": [
                {
                    "id": "test-d1",
                    "title": "Test domain",
                    "chapter": "test-chapter",
                    "clusters": [
                        {
                            "id": "cluster-one",
                            "title": "Cluster one",
                            "objectives": [
                                {"id": "AZ104-1.1", "text": "First objective"},
                                {"id": "AZ104-1.2", "text": "Second objective"},
                            ],
                        }
                    ],
                }
            ],
        },
    )
    _write(
        root / "diagrams" / "act1.yaml",
        {
            "schema_version": 1,
            "id": "act1",
            "nodes": [
                {"id": "vnet-hub", "label": "Hub", "kind": "vnet"},
                {"id": "vnet-spoke", "label": "Spoke", "kind": "vnet"},
            ],
            "edges": [
                {"id": "peer-hub-spoke", "source": "vnet-hub", "target": "vnet-spoke"}
            ],
        },
    )
    _write(root / "quests" / "test-quest.yaml", sample_quest())
    return root


def sample_quest():
    return {
        "schema_version": 1,
        "id": "test-quest",
        "title": "Test Quest",
        "act": 1,
        "chapter": "test-chapter",
        "domain": "test-d1",
        "order": 1,
        "entry": "e1",
        "encounters": [
            {
                "id": "e1",
                "type": "design_decision",
                "title": "A decision",
                "objectives": ["AZ104-1.1"],
                "scenario": "Something happened at the warehouse.",
                "options": [
                    {
                        "id": "opt-good",
                        "label": "The right call",
                        "correct": True,
                        "explain": "Because it is.",
                        "diagram_ops": [
                            {"op": "set_status", "node": "vnet-hub", "status": "healthy"}
                        ],
                    },
                    {
                        "id": "opt-bad",
                        "label": "The wrong call",
                        "correct": False,
                        "explain": "Because it is not.",
                    },
                ],
                "next": "e2",
            },
            {
                "id": "e2",
                "type": "troubleshoot",
                "title": "An incident",
                "objectives": ["AZ104-1.2"],
                "scenario": "The spoke cannot reach the hub.",
                "on_enter_diagram_ops": [
                    {"op": "set_status", "node": "vnet-spoke", "status": "broken"}
                ],
                "time_budget": 4,
                "investigate": [
                    {"id": "inv-a", "label": "Ask the NOC", "reveals": "They changed a peering."},
                    {"id": "inv-b", "label": "Read the ticket", "reveals": "It started at 09:12."},
                ],
                "commands": [
                    {
                        "id": "cmd-a",
                        "command": "az network vnet peering list -o table",
                        "output": "Name  State\nx     Initiated",
                        "time_cost": 1,
                    },
                    {
                        "id": "cmd-b",
                        "command": "az network nic show-effective-route-table -o table",
                        "output": "No route",
                        "time_cost": 2,
                    },
                ],
                "fixes": [
                    {
                        "id": "fix-good",
                        "label": "Recreate the peering",
                        "correct": True,
                        "explain": "Peering is two objects.",
                        "diagram_ops": [
                            {"op": "set_status", "node": "vnet-spoke", "status": "healthy"}
                        ],
                    },
                    {
                        "id": "fix-bad",
                        "label": "Restart everything",
                        "correct": False,
                        "explain": "That is not the failure.",
                    },
                ],
                "next": "END",
            },
        ],
    }


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, sort_keys=False)


@pytest.fixture
def write_quest(content_root):
    """Write a quest dict into the fixture tree under its own id."""

    def _writer(quest: dict):
        _write(content_root / "quests" / f"{quest['id']}.yaml", quest)
        return content_root

    return _writer
