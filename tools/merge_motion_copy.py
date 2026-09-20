"""Review or apply the isolated motion work without overwriting newer target edits.

The default is a dry run. Applying requires the JSON report from a matching
dry run, so the reviewed source and target hashes cannot silently drift.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_NAME = "public/assets/manifest.json"
MAIN_BASELINE_NAME = "tools/motion-base-hashes.json"
EXTRA_BASELINE_NAME = "tools/motion-extra-base-hashes.json"


class MergeConflictError(RuntimeError):
    pass


class SourceChangedError(RuntimeError):
    pass


class TargetChangedError(RuntimeError):
    pass


class ReviewMismatchError(RuntimeError):
    pass


class ApplyFailedError(RuntimeError):
    def __init__(self, message: str, rollback_succeeded: bool):
        super().__init__(message)
        self.rollback_succeeded = rollback_succeeded


def digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_extra_baseline(
    source_root: Path,
) -> tuple[dict[str, str | None], dict[str, Any], str, dict[str, Any]]:
    path = source_root / EXTRA_BASELINE_NAME
    data = load_json(path)
    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        raise ValueError(f"Invalid extra baseline: {path}")
    files: dict[str, str | None] = {}
    for name, value in data["files"].items():
        if not isinstance(name, str) or (value is not None and not isinstance(value, str)):
            raise ValueError(f"Invalid extra baseline entry: {name!r}")
        files[name] = value
    conditional = data.get("conditionalFiles", {})
    if not isinstance(conditional, dict):
        raise ValueError(f"Invalid conditionalFiles in {path}")
    return files, conditional, digest(path) or "", data


def _selected_extra_paths(
    source_root: Path,
    extra_files: dict[str, str | None],
    conditional: dict[str, Any],
) -> tuple[dict[str, str | None], list[dict[str, Any]]]:
    selected = dict(extra_files)
    omitted: list[dict[str, Any]] = []
    for name, raw in sorted(conditional.items()):
        meta = raw if isinstance(raw, dict) else {}
        checker_name = meta.get("includeWhenReferencedBy")
        checker = source_root / checker_name if isinstance(checker_name, str) else None
        referenced = bool(
            checker
            and checker.is_file()
            and name in checker.read_text(encoding="utf-8")
        )
        if referenced:
            selected[name] = meta.get("targetSha256")
        else:
            omitted.append({
                "path": name,
                "reason": "not-referenced-by-checker",
                "checker": checker_name,
            })
    return selected, omitted


def _source_paths(source_root: Path, extra_paths: dict[str, str | None]) -> list[Path]:
    paths: set[Path] = set()
    for folder in ("src", "tests", "public"):
        base = source_root / folder
        if base.is_dir():
            paths.update(path for path in base.rglob("*") if path.is_file())
    for name in ("launch-complete-motion.cmd", "tools/launch-complete-motion.ps1"):
        path = source_root / name
        if path.is_file():
            paths.add(path)
    for name in extra_paths:
        path = source_root / name
        if path.is_file():
            paths.add(path)
    return sorted(paths, key=lambda path: path.relative_to(source_root).as_posix())


def _plan_manifest(source_root: Path, target_root: Path) -> dict[str, Any]:
    source_path = source_root / MANIFEST_NAME
    target_path = target_root / MANIFEST_NAME
    source_hash = digest(source_path)
    before_hash = digest(target_path)
    if source_hash is None or before_hash is None:
        raise ValueError("Both source and target manifests must exist")
    source = load_json(source_path)
    merged = load_json(target_path)
    if not isinstance(source, dict) or not isinstance(merged, dict):
        raise ValueError("Both manifests must contain JSON objects")

    added: list[str] = []
    conflicts: list[dict[str, Any]] = []
    for section, entries in source.items():
        if not isinstance(entries, dict):
            if section not in merged:
                merged[section] = entries
                added.append(section)
            elif merged[section] != entries:
                conflicts.append({
                    "path": f"{MANIFEST_NAME}::{section}",
                    "reason": "manifest-value-mismatch",
                })
            continue
        existing = merged.get(section)
        if existing is None:
            existing = {}
            merged[section] = existing
        if not isinstance(existing, dict):
            conflicts.append({
                "path": f"{MANIFEST_NAME}::{section}",
                "reason": "manifest-section-type-mismatch",
            })
            continue
        for key, value in entries.items():
            if key not in existing:
                existing[key] = value
                added.append(f"{section}/{key}")
            elif existing[key] != value:
                conflicts.append({
                    "path": f"{MANIFEST_NAME}::{section}/{key}",
                    "reason": "manifest-value-mismatch",
                })

    after_bytes = (json.dumps(merged, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return {
        "path": MANIFEST_NAME,
        "sourceHash": source_hash,
        "before": before_hash,
        "after": digest_bytes(after_bytes),
        "addedKeys": added,
        "write": bool(added),
        "conflicts": conflicts,
        "_afterBytes": after_bytes,
    }


def _fingerprint_projection(plan: dict[str, Any]) -> dict[str, Any]:
    manifest = plan["manifest"]
    return {
        "sourceRoot": plan["sourceRoot"],
        "targetRoot": plan["targetRoot"],
        "baselines": plan["baselines"],
        "writes": plan["writes"],
        "conflicts": plan["conflicts"],
        "manifest": {
            "sourceHash": manifest["sourceHash"],
            "before": manifest["before"],
            "after": manifest["after"],
            "addedKeys": manifest["addedKeys"],
            "write": manifest["write"],
        },
    }


def build_plan(source_root: Path, target_root: Path) -> dict[str, Any]:
    source_root = source_root.resolve()
    target_root = target_root.resolve()
    if target_root == source_root or not (target_root / "src/main.ts").is_file():
        raise ValueError("Expected a separate existing qiuqiu checkout")

    main_baseline_path = source_root / MAIN_BASELINE_NAME
    main_baseline = load_json(main_baseline_path)
    if not isinstance(main_baseline, dict):
        raise ValueError(f"Invalid main baseline: {main_baseline_path}")
    extra_baseline, conditional, extra_baseline_hash, extra_metadata = _load_extra_baseline(
        source_root
    )
    recorded_target = extra_metadata.get("targetRoot")
    if recorded_target and Path(recorded_target).resolve() != target_root:
        raise ValueError(
            f"Extra baseline was captured for {recorded_target}, not {target_root}"
        )
    selected_extra, conditional_omissions = _selected_extra_paths(
        source_root, extra_baseline, conditional
    )

    writes: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    identical: list[dict[str, Any]] = []
    baseline_unchanged: list[dict[str, Any]] = []
    required_missing: list[str] = []
    baseline: dict[str, str | None] = dict(main_baseline)
    baseline.update(selected_extra)

    for name in selected_extra:
        if not (source_root / name).is_file():
            required_missing.append(name)
            conflicts.append({"path": name, "reason": "required-source-missing"})

    paths = _source_paths(source_root, selected_extra)
    for source in paths:
        name = source.relative_to(source_root).as_posix()
        if name == MANIFEST_NAME:
            continue
        source_hash = digest(source)
        target_hash = digest(target_root / name)
        base_hash = baseline.get(name)
        if source_hash == target_hash:
            identical.append({"path": name, "hash": source_hash})
            continue
        if source_hash == base_hash:
            baseline_unchanged.append({
                "path": name,
                "sourceHash": source_hash,
                "targetHash": target_hash,
            })
            continue
        if target_hash != base_hash:
            conflicts.append({
                "path": name,
                "reason": "target-diverged-from-baseline",
                "baseline": base_hash,
                "target": target_hash,
                "source": source_hash,
            })
            continue
        writes.append({"path": name, "before": target_hash, "after": source_hash})

    manifest = _plan_manifest(source_root, target_root)
    conflicts.extend(manifest["conflicts"])
    plan: dict[str, Any] = {
        "schemaVersion": 2,
        "sourceRoot": str(source_root),
        "targetRoot": str(target_root),
        "baselines": {
            "main": {"path": MAIN_BASELINE_NAME, "sha256": digest(main_baseline_path)},
            "extra": {
                "path": EXTRA_BASELINE_NAME,
                "sha256": extra_baseline_hash,
                "snapshotKind": extra_metadata.get("snapshotKind"),
                "capturedAt": extra_metadata.get("capturedAt"),
                "targetRoot": extra_metadata.get("targetRoot"),
            },
        },
        "inventory": {
            "scannedFiles": len(paths),
            "selectedExtraPaths": sorted(selected_extra),
            "requiredExtraMissing": required_missing,
        },
        "writes": writes,
        "omissions": {
            "identical": identical,
            "sourceMatchesBaseline": baseline_unchanged,
        },
        "conditionalOmissions": conditional_omissions,
        "manifest": manifest,
        "conflicts": conflicts,
    }
    plan["planFingerprint"] = _canonical_hash(_fingerprint_projection(plan))
    return plan


def validate_reviewed_plan(review: dict[str, Any], current: dict[str, Any]) -> None:
    if review.get("mode") != "dry-run":
        raise ReviewMismatchError("The review report is not a dry-run report")
    if review.get("sourceRoot") != current["sourceRoot"]:
        raise ReviewMismatchError("The reviewed source checkout does not match")
    if review.get("targetRoot") != current["targetRoot"]:
        raise ReviewMismatchError("The reviewed target checkout does not match")
    if review.get("planFingerprint") != current["planFingerprint"]:
        raise ReviewMismatchError(
            "Source, target, baseline, or manifest changed after the reviewed dry run"
        )


def _atomic_install(staged: Path, destination: Path, expected_hash: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=".motion-merge-", suffix=".tmp", dir=destination.parent, delete=False
    )
    temp_path = Path(handle.name)
    handle.close()
    try:
        shutil.copy2(staged, temp_path)
        if digest(temp_path) != expected_hash:
            raise RuntimeError(f"Staged copy mismatch: {destination}")
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


def _rollback(
    applied: list[dict[str, Any]], target_root: Path, backup_root: Path
) -> bool:
    succeeded = True
    for item in reversed(applied):
        destination = target_root / item["path"]
        try:
            if digest(destination) != item["after"]:
                succeeded = False
                continue
            if item["before"] is None:
                destination.unlink(missing_ok=True)
            else:
                saved = backup_root / item["path"]
                _atomic_install(saved, destination, item["before"])
            if digest(destination) != item["before"]:
                succeeded = False
        except Exception:
            succeeded = False
    return succeeded


def apply_plan(
    plan: dict[str, Any], source_root: Path, target_root: Path, stamp: str | None = None
) -> dict[str, Any]:
    source_root = source_root.resolve()
    target_root = target_root.resolve()
    if str(source_root) != plan["sourceRoot"] or str(target_root) != plan["targetRoot"]:
        raise ReviewMismatchError("Plan roots do not match the requested checkouts")
    if plan["conflicts"]:
        raise MergeConflictError("Conflicts must be resolved before apply")

    stamp = stamp or datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    # Keep old test files outside the checkout so Vitest cannot discover them.
    backup_root = target_root.parent / f"{target_root.name}-motion-backups" / stamp
    if backup_root.exists():
        raise FileExistsError(f"Backup already exists: {backup_root}")

    manifest = plan["manifest"]
    targets = [dict(item) for item in plan["writes"]]
    if manifest["write"]:
        targets.append({
            "path": MANIFEST_NAME,
            "before": manifest["before"],
            "after": manifest["after"],
            "manifest": True,
        })

    with tempfile.TemporaryDirectory(prefix="motion-merge-stage-") as raw_stage:
        stage_root = Path(raw_stage)
        for item in plan["writes"]:
            source = source_root / item["path"]
            if digest(source) != item["after"]:
                raise SourceChangedError(f"Source changed after review: {item['path']}")
            staged = stage_root / item["path"]
            staged.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, staged)
            if digest(staged) != item["after"]:
                raise SourceChangedError(f"Source changed while staging: {item['path']}")

        if digest(source_root / MANIFEST_NAME) != manifest["sourceHash"]:
            raise SourceChangedError("Source manifest changed after review")
        if manifest["write"]:
            staged_manifest = stage_root / MANIFEST_NAME
            staged_manifest.parent.mkdir(parents=True, exist_ok=True)
            staged_manifest.write_bytes(manifest["_afterBytes"])
            if digest(staged_manifest) != manifest["after"]:
                raise RuntimeError("Planned manifest hash mismatch")

        for item in targets:
            if digest(target_root / item["path"]) != item["before"]:
                raise TargetChangedError(f"Target changed after review: {item['path']}")

        backup_root.mkdir(parents=True, exist_ok=False)
        for item in targets:
            if item["before"] is None:
                continue
            source = target_root / item["path"]
            saved = backup_root / item["path"]
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, saved)
            if digest(saved) != item["before"]:
                raise TargetChangedError(f"Target changed while backing up: {item['path']}")

        applied: list[dict[str, Any]] = []
        verified: list[dict[str, Any]] = []
        try:
            for item in targets:
                destination = target_root / item["path"]
                if digest(destination) != item["before"]:
                    raise TargetChangedError(f"Target changed during merge: {item['path']}")
                staged = stage_root / item["path"]
                _atomic_install(staged, destination, item["after"])
                applied.append(item)
                actual = digest(destination)
                if actual != item["after"]:
                    raise RuntimeError(f"Copy verification failed: {item['path']}")
                verified.append({
                    "path": item["path"],
                    "before": item["before"],
                    "after": actual,
                    "backup": str(backup_root / item["path"]) if item["before"] else None,
                })
        except Exception as exc:
            rollback_succeeded = _rollback(applied, target_root, backup_root)
            raise ApplyFailedError(str(exc), rollback_succeeded) from exc

    return {
        "completed": True,
        "backup": str(backup_root),
        "verifiedWrites": verified,
        "rollbackNeeded": False,
    }


def report_from_plan(plan: dict[str, Any], mode: str) -> dict[str, Any]:
    manifest = plan["manifest"]
    return {
        "schemaVersion": plan["schemaVersion"],
        "createdAt": datetime.now().astimezone().isoformat(),
        "mode": mode,
        "sourceRoot": plan["sourceRoot"],
        "targetRoot": plan["targetRoot"],
        "baselines": plan["baselines"],
        "inventory": plan["inventory"],
        "writes": plan["writes"],
        "writeCount": len(plan["writes"]) + (1 if manifest["write"] else 0),
        "omissions": plan["omissions"],
        "conditionalOmissions": plan["conditionalOmissions"],
        "manifest": {
            "path": manifest["path"],
            "sourceHash": manifest["sourceHash"],
            "before": manifest["before"],
            "after": manifest["after"],
            "addedKeys": manifest["addedKeys"],
            "write": manifest["write"],
        },
        "conflicts": plan["conflicts"],
        "safeToApply": not plan["conflicts"],
        "planFingerprint": plan["planFingerprint"],
        "sourceSnapshotPolicy": "review-fingerprint plus staged files verified against reviewed SHA-256",
        "completed": False,
    }


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--review-report",
        type=Path,
        help="required with --apply; must be the unchanged matching dry-run report",
    )
    args = parser.parse_args(argv)
    target = args.target.resolve()
    plan = build_plan(ROOT, target)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    report_path = ROOT / "docs" / f"motion-merge-{stamp}.json"
    report = report_from_plan(plan, "apply" if args.apply else "dry-run")

    exit_code = 0
    if args.apply:
        if args.review_report is None:
            report["applyError"] = "--apply requires --review-report from a matching dry run"
            exit_code = 2
        elif plan["conflicts"]:
            report["applyError"] = "conflicts block apply"
            exit_code = 2
        else:
            try:
                review = load_json(args.review_report.resolve())
                validate_reviewed_plan(review, plan)
                report.update(apply_plan(plan, ROOT, target, stamp=stamp))
                report["reviewReport"] = str(args.review_report.resolve())
            except Exception as exc:
                report["applyError"] = str(exc)
                if isinstance(exc, ApplyFailedError):
                    report["rollbackSucceeded"] = exc.rollback_succeeded
                exit_code = 3
    elif plan["conflicts"]:
        exit_code = 2

    _write_report(report_path, report)
    print(json.dumps({
        "mode": report["mode"],
        "writes": report["writeCount"],
        "manifestAddedKeys": len(report["manifest"]["addedKeys"]),
        "conflicts": [item["path"] for item in report["conflicts"]],
        "safeToApply": report["safeToApply"],
        "completed": report["completed"],
        "report": str(report_path),
    }, ensure_ascii=False))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
