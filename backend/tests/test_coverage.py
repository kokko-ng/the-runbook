from content_pipeline.coverage import build_coverage
from content_pipeline.loader import load_tree
from tests.conftest import sample_quest


def coverage_for(root):
    return build_coverage(load_tree(root))


def test_authored_domain_is_enforced_and_fully_covered(content_root):
    report = coverage_for(content_root)
    assert [domain.id for domain in report.enforced] == ["test-d1"]
    assert report.failures() == []


def test_uncovered_objective_fails(write_quest):
    quest = sample_quest()
    quest["encounters"][1]["objectives"] = ["AZ104-1.1"]
    root = write_quest(quest)
    failures = coverage_for(root).failures()
    assert any("AZ104-1.2" in failure and "not covered" in failure for failure in failures)


def test_bonus_quest_cannot_be_sole_coverage(write_quest):
    """An objective taught only in a bonus variant is not covered."""
    main = sample_quest()
    main["encounters"][1]["objectives"] = ["AZ104-1.1"]
    write_quest(main)

    bonus = sample_quest()
    bonus["id"] = "test-quest-hard"
    bonus["bonus_variant_of"] = "test-quest"
    bonus["encounters"][0]["objectives"] = ["AZ104-1.2"]
    bonus["encounters"][1]["objectives"] = ["AZ104-1.2"]
    root = write_quest(bonus)

    failures = coverage_for(root).failures()
    assert any("bonus" in failure and "AZ104-1.2" in failure for failure in failures)


def test_bonus_quest_alone_does_not_enforce_a_domain(content_root):
    """A domain with only bonus quests is unauthored, not failing."""
    (content_root / "quests" / "test-quest.yaml").unlink()
    bonus = sample_quest()
    bonus["id"] = "test-quest-hard"
    bonus["bonus_variant_of"] = "test-quest"
    import yaml

    with (content_root / "quests" / "test-quest-hard.yaml").open("w") as handle:
        yaml.safe_dump(bonus, handle, sort_keys=False)

    report = coverage_for(content_root)
    assert report.enforced == []
    assert report.failures() == []


def test_require_all_flags_unauthored_domains(content_root):
    (content_root / "quests" / "test-quest.yaml").unlink()
    failures = coverage_for(content_root).failures(require_all=True)
    assert any("has no authored quests" in failure for failure in failures)


def test_matrix_rows_report_status(content_root):
    rows = coverage_for(content_root).as_rows()
    statuses = {row[0]: row[2] for row in rows}
    assert statuses == {"AZ104-1.1": "covered", "AZ104-1.2": "covered"}


def test_real_content_tree_has_full_coverage(settings):
    """The shipped content must always pass its own gate."""
    report = coverage_for(settings.CONTENT_DIR)
    assert report.failures() == []
    assert report.enforced, "expected at least one authored domain"
