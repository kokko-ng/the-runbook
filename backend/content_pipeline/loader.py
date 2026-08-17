"""Discovery and YAML loading for the content tree.

The content tree is the single source of truth for the game:

    content/schema/      JSON Schemas (the contract)
    content/objectives/  exam objective registries, one per exam
    content/diagrams/    base architecture diagram, one per act
    content/quests/      quest YAML, one file per quest
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ContentError(Exception):
    """Unrecoverable problem reading the content tree (bad YAML, missing file)."""


@dataclass
class LoadedFile:
    path: Path
    data: dict[str, Any]

    @property
    def rel(self) -> str:
        return self.path.name


@dataclass
class ContentTree:
    root: Path
    objectives: list[LoadedFile] = field(default_factory=list)
    diagrams: list[LoadedFile] = field(default_factory=list)
    quests: list[LoadedFile] = field(default_factory=list)

    @property
    def schema_dir(self) -> Path:
        return self.root / "schema"


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except yaml.YAMLError as exc:
        raise ContentError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ContentError(f"{path}: expected a YAML mapping at the top level")
    return data


def load_tree(root: Path) -> ContentTree:
    """Read every YAML file under the content root into memory."""
    if not root.is_dir():
        raise ContentError(f"content root not found: {root}")

    tree = ContentTree(root=root)
    for path in sorted((root / "objectives").glob("*.yaml")):
        tree.objectives.append(LoadedFile(path, _read_yaml(path)))
    for path in sorted((root / "diagrams").glob("*.yaml")):
        tree.diagrams.append(LoadedFile(path, _read_yaml(path)))
    for path in sorted((root / "quests").rglob("*.yaml")):
        tree.quests.append(LoadedFile(path, _read_yaml(path)))
    return tree


def load_schema(schema_dir: Path, name: str) -> dict[str, Any]:
    import json

    path = schema_dir / name
    if not path.is_file():
        raise ContentError(f"schema not found: {path}")
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)
