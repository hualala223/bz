#!/usr/bin/env python3
"""Validate a post-commit audit report and project adjudicated items into revision_guard plan JSONs.

The audit report (追踪/定稿核验/第NNN章_核验.md) carries one ```json block with
kind=post_commit_audit. Every S1/S2 item must carry a user-adjudicated direction:
fix_text (redo the chapter per design) or fix_design (update downstream design per
committed text). This script never edits canon artifacts; it only validates the
report and emits plan documents consumable by revision_guard.py plan.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
AUDIT_KIND = "post_commit_audit"
CHAPTER_RE = re.compile(r"第0*(\d+)章")
ITEM_ID_RE = re.compile(r"^D\d{3,}$")
FACT_ID_RE = re.compile(r"^[KR]\d{3,}$")
SEVERITIES = {"S1", "S2", "S3"}
DIRECTIONS = {"fix_text", "fix_design", "none"}
SOURCE_ROOTS = ("正文", "大纲", "设定")
DERIVED_TRACKING_PREFIXES = (
    "追踪/上下文.md", "追踪/伏笔.md", "追踪/长期事实.md", "追踪/关系清单.md",
    "追踪/角色状态/", "追踪/事实档案/", "追踪/时间线/", "追踪/逐章记录/",
)
IGNORED_SOURCE_DIR_NAMES = {"归档", "archive", "archives"}
PLAN_BASENAMES = {"fix_design": "修订计划_改设计", "fix_text": "修订计划_改正文"}
PLAN_SUMMARIES = {
    "fix_design": "照定稿正文修正设计",
    "fix_text": "照设计回炉定稿正文",
}


class AuditError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AuditError(message)


def clean_text(value: object, label: str) -> str:
    require(isinstance(value, str), f"{label} must be a string")
    text = " ".join(value.split())
    require(text, f"{label} must not be empty")
    return text


def extract_audit_block(report_path: Path) -> dict[str, Any]:
    try:
        text = report_path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError) as exc:
        raise AuditError(f"unable to read report {report_path}: {exc}") from exc
    found: list[dict[str, Any]] = []
    for match in re.finditer(r"```json\s*(.*?)```", text, flags=re.DOTALL):
        try:
            document = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(document, dict) and document.get("kind") == AUDIT_KIND:
            found.append(document)
    require(found, "report contains no parsable ```json block with kind=post_commit_audit")
    return found[0]


def check_source_file(project: Path, raw: object, label: str) -> str:
    relative = clean_text(raw, label)
    path = Path(relative)
    require(not path.is_absolute(), f"{label} must be project-relative")
    require(relative.startswith(tuple(f"{root}/" for root in SOURCE_ROOTS)), f"{label} must live under 设定/, 大纲/ or 正文/: {relative}")
    parts = path.parts[:-1]
    require(not any("备份" in part or part in IGNORED_SOURCE_DIR_NAMES for part in parts), f"{label} references a backup/archive copy: {relative}")
    require(not relative.startswith(DERIVED_TRACKING_PREFIXES), f"{label} must not be a derived tracking view: {relative}")
    require((project / path).is_file(), f"{label} does not exist: {relative}")
    return relative


def as_str_list(value: object, label: str) -> list[str]:
    require(isinstance(value, list), f"{label} must be a JSON array")
    return [clean_text(item, f"{label}[{index}]") for index, item in enumerate(value)]


def as_int_list(value: object, label: str) -> list[int]:
    require(isinstance(value, list), f"{label} must be a JSON array")
    for index, item in enumerate(value):
        require(isinstance(item, int) and not isinstance(item, bool) and item >= 1, f"{label}[{index}] must be a positive integer")
    return list(value)


def validate_audit(project: Path, document: object) -> dict[str, Any]:
    root = document
    require(isinstance(root, dict), "audit block must be a JSON object")
    require(root.get("schema_version") == SCHEMA_VERSION, "audit schema_version is unsupported")
    require(root.get("kind") == AUDIT_KIND, "audit kind mismatch")
    chapter = root.get("chapter")
    require(isinstance(chapter, int) and not isinstance(chapter, bool) and chapter >= 1, "chapter must be a positive integer")
    verdict = clean_text(root.get("verdict"), "verdict")
    require(verdict in {"clean", "conflicts"}, "verdict must be clean or conflicts")
    dimensions = root.get("dimensions_checked", [])
    require(isinstance(dimensions, list) and all(isinstance(item, str) and item for item in dimensions), "dimensions_checked must be an array of names")
    items_raw = root.get("items", [])
    require(isinstance(items_raw, list), "items must be a JSON array")

    items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(items_raw):
        require(isinstance(raw, dict), f"items[{index}] must be an object")
        allowed = {
            "id", "severity", "dimension", "location", "design_source", "design_claim",
            "text_claim", "direction", "affected_entities", "affected_fact_ids",
            "affected_chapters", "proposed_files", "note",
        }
        require(not (set(raw) - allowed), f"items[{index}] contains unsupported fields: {sorted(set(raw) - allowed)}")
        item_id = clean_text(raw.get("id"), f"items[{index}].id")
        require(ITEM_ID_RE.fullmatch(item_id) is not None, f"items[{index}].id must look like D001")
        require(item_id not in seen_ids, f"items[{index}].id duplicates {item_id}")
        seen_ids.add(item_id)
        severity = clean_text(raw.get("severity"), f"items[{index}].severity")
        require(severity in SEVERITIES, f"items[{index}].severity must be S1, S2 or S3")
        direction = clean_text(raw.get("direction"), f"items[{index}].direction")
        require(direction in DIRECTIONS, f"items[{index}].direction must be fix_text, fix_design or none")
        if severity in {"S1", "S2"}:
            require(direction in {"fix_text", "fix_design"}, f"items[{index}] {severity} needs an adjudicated direction before projection")
        else:
            require(direction == "none", f"items[{index}] S3 must use direction none")
        clean_text(raw.get("dimension"), f"items[{index}].dimension")
        clean_text(raw.get("location"), f"items[{index}].location")
        clean_text(raw.get("design_claim"), f"items[{index}].design_claim")
        clean_text(raw.get("text_claim"), f"items[{index}].text_claim")
        entities = sorted(set(as_str_list(raw.get("affected_entities", []), f"items[{index}].affected_entities")))
        fact_ids = sorted(set(as_str_list(raw.get("affected_fact_ids", []), f"items[{index}].affected_fact_ids")))
        for fact_id in fact_ids:
            require(FACT_ID_RE.fullmatch(fact_id) is not None, f"items[{index}].affected_fact_ids must look like K001 or R001")
        chapters = sorted(set(as_int_list(raw.get("affected_chapters", []), f"items[{index}].affected_chapters")))
        proposed_raw = raw.get("proposed_files", [])
        require(isinstance(proposed_raw, list), f"items[{index}].proposed_files must be a JSON array")
        if direction == "fix_design":
            require(proposed_raw, f"items[{index}] fix_design needs at least one proposed_files entry")
        proposed = sorted({check_source_file(project, entry, f"items[{index}].proposed_files") for entry in proposed_raw})
        items.append({
            "id": item_id,
            "severity": severity,
            "direction": direction,
            "affected_entities": entities,
            "affected_fact_ids": fact_ids,
            "affected_chapters": chapters,
            "proposed_files": proposed,
        })

    has_blocking = any(item["severity"] in {"S1", "S2"} for item in items)
    expected_verdict = "conflicts" if has_blocking else "clean"
    require(verdict == expected_verdict, "verdict contradicts item severities")
    return {"chapter": chapter, "verdict": verdict, "items": items}


def chapter_canon_files(project: Path, chapter: int) -> list[str]:
    located: list[str] = []
    root = project / "正文"
    require(root.is_dir(), "project has no 正文/ directory")
    for path in sorted(root.rglob("*.md")):
        match = CHAPTER_RE.search(path.name)
        if match and int(match.group(1)) == chapter:
            located.append(path.relative_to(project).as_posix())
    require(located, f"no committed chapter file found under 正文/ for 第{chapter}章")
    return located


def used_change_ids(ledger_path: Path) -> set[str]:
    if not ledger_path.is_file():
        return set()
    used: set[str] = set()
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        for plan in entry.get("plans", []):
            change_id = plan.get("change_id")
            if isinstance(change_id, str):
                used.add(change_id)
    return used


def allocate_change_id(base: str, used: set[str]) -> str:
    if base not in used:
        return base
    suffix = 2
    while f"{base}-{suffix}" in used:
        suffix += 1
    return f"{base}-{suffix}"


def build_plan(project: Path, kind: str, change_id: str, chapter: int, items: list[dict[str, Any]]) -> dict[str, Any]:
    changed: set[str] = set()
    entities: set[str] = set()
    fact_ids: set[str] = set()
    chapters: set[int] = set()
    adjudicated = [item for item in items if item["direction"] == kind]
    for item in adjudicated:
        entities.update(item["affected_entities"])
        fact_ids.update(item["affected_fact_ids"])
        chapters.update(item["affected_chapters"])
        if kind == "fix_design":
            changed.update(item["proposed_files"])
    if kind == "fix_text":
        changed.update(chapter_canon_files(project, chapter))
        chapters.add(chapter)
    broad = any(
        path.startswith("设定/") or "总纲" in Path(path).name or "卷纲" in Path(path).name or Path(path).name == "大纲.md"
        for path in changed
    )
    require(not broad or entities or chapters, f"{kind} plan touches 设定/总纲/卷纲 but declares no affected_entities or affected_chapters")
    require(changed, f"{kind} plan has no changed_files")
    item_ids = ",".join(item["id"] for item in adjudicated)
    return {
        "schema_version": SCHEMA_VERSION,
        "change_id": change_id,
        "summary": f"第{chapter}章定稿核验裁决：{PLAN_SUMMARIES[kind]}（{item_ids}）",
        "semantic_change": True,
        "changed_files": sorted(changed),
        "affected_entities": sorted(entities),
        "affected_fact_ids": sorted(fact_ids),
        "affected_chapters": sorted(chapters),
    }


def append_ledger(ledger_path: Path, entry: dict[str, Any]) -> None:
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "project"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--project", type=Path, required=True)
        sub.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    try:
        project_root = args.project.resolve()
        require(project_root.is_dir(), "project root does not exist")
        report_path = args.input.resolve()
        require(report_path.is_file(), "audit report does not exist")
        audit = validate_audit(project_root, extract_audit_block(report_path))
        chapter = audit["chapter"]
        counts: dict[str, int] = {}
        for item in audit["items"]:
            counts[item["severity"]] = counts.get(item["severity"], 0) + 1
        result: dict[str, Any] = {
            "chapter": chapter,
            "verdict": audit["verdict"],
            "item_counts": counts,
            "report": str(report_path),
        }
        if args.command == "validate":
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
            return 0

        outdir = project_root / "追踪" / "定稿核验"
        ledger_path = outdir / "_ledger.jsonl"
        used = used_change_ids(ledger_path)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        plans: list[dict[str, str]] = []
        for kind in ("fix_design", "fix_text"):
            if not any(item["direction"] == kind for item in audit["items"]):
                continue
            change_id = allocate_change_id(f"audit{chapter:03d}{'d' if kind == 'fix_design' else 't'}{stamp}", used)
            used.add(change_id)
            plan = build_plan(project_root, kind, change_id, chapter, audit["items"])
            plan_path = outdir / f"第{chapter:03d}章_{PLAN_BASENAMES[kind]}.json"
            plan_path.parent.mkdir(parents=True, exist_ok=True)
            plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
            plans.append({"kind": kind, "change_id": change_id, "path": str(plan_path)})
        # 协议第八节：verdict=clean 时报告落盘 + ledger 记录即完成——clean 结论
        # 同样登记 ledger（plans 为空），保证每章审计在账本上可追溯。
        entry = {
            "at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "chapter": chapter,
            "verdict": audit["verdict"],
            "item_counts": counts,
            "plans": plans,
        }
        append_ledger(ledger_path, entry)
        print(json.dumps({**result, "plans": plans, "ledger": str(ledger_path)}, ensure_ascii=False, sort_keys=True))
        return 0
    except (AuditError, OSError, UnicodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
