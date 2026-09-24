#!/usr/bin/env python3
"""Port the selected Godot motion sheets to lossless WebP and verify pixels."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


ACTION_NAMES = (
    "idle",
    "hurt",
    "down",
    "walk",
    "run",
    "roll",
    "jump",
    "land",
    "attack1",
    "attack2",
    "attack3",
    "dash",
    "clone",
    "attack4",
    "attack_run",
    "attack_air",
    "shuriken",
    "kick",
    "seal",
    "storm",
    "rush",
    "combo_kick",
    "uppercut",
    "flying_kick",
)
PROJECTILE_SPECS = (("shuriken", "res://assets/fx/shuriken.png", "shuriken.webp"),)
MOTION_JSON = Path("assets/player/motions.json")
TARGET_DATA = Path("src/ui/qiuqiu-motion-data.json")
TARGET_DOC = Path("docs/qiuqiu-motion-assets.json")
TARGET_ASSET_DIR = Path("public/assets/motion/qiuqiu")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def posix_path(path: Path) -> str:
    return path.resolve().as_posix()


def default_source_root(project_root: Path) -> Path:
    """Find a neighbouring GODOT checkout without embedding a user directory."""

    suffix = Path("qiuqiu-2d-motion-lab/qiuqiu-air-combat-v005")
    candidates: list[Path] = []
    ancestor = project_root
    for _ in range(6):
        candidates.append(ancestor / "GODOT" / suffix)
        ancestor = ancestor.parent
    candidates.append(Path(project_root.anchor) / "GODOT" / suffix)

    for candidate in candidates:
        if (candidate / MOTION_JSON).is_file():
            return candidate.resolve()
    checked = ", ".join(str(candidate) for candidate in candidates)
    raise FileNotFoundError(
        "找不到預設 Godot 根目錄，請以 --source 指定包含 assets/player/motions.json 的目錄。"
        f" 已檢查：{checked}"
    )


def source_path_for_texture(source_root: Path, texture: str) -> Path:
    prefix = "res://"
    if not texture.startswith(prefix):
        raise ValueError(f"texture 不是 res:// 路徑：{texture}")

    source_root = source_root.resolve()
    source_path = (source_root / texture[len(prefix) :]).resolve()
    try:
        source_path.relative_to(source_root)
    except ValueError as exc:
        raise ValueError(f"texture 超出來源根目錄：{texture}") from exc
    if not source_path.is_file():
        raise FileNotFoundError(f"找不到來源圖檔：{source_path}")
    return source_path


def compare_rgba(source_path: Path, output_path: Path) -> dict[str, Any]:
    """Compare alpha and visible RGB values; transparent RGB may differ."""

    with Image.open(source_path) as source_image:
        source_mode = source_image.mode
        source_rgba = source_image.convert("RGBA")
        source_rgba.load()
    with Image.open(output_path) as output_image:
        output_mode = output_image.mode
        output_rgba = output_image.convert("RGBA")
        output_rgba.load()

    source_size = list(source_rgba.size)
    output_size = list(output_rgba.size)
    result: dict[str, Any] = {
        "source_mode": source_mode,
        "output_mode": output_mode,
        "source_dimensions": source_size,
        "output_dimensions": output_size,
        "dimensions_match": source_size == output_size,
        "alpha_mismatch_pixels": 0,
        "visible_rgb_mismatch_pixels": 0,
        "transparent_rgb_mismatch_pixels": 0,
        "visible_pixels": 0,
        "transparent_pixels": 0,
    }
    if source_size != output_size:
        result["rgba_visible_alpha_match"] = False
        return result

    source_bytes = source_rgba.tobytes()
    output_bytes = output_rgba.tobytes()
    for index in range(0, len(source_bytes), 4):
        source_rgb = source_bytes[index : index + 3]
        output_rgb = output_bytes[index : index + 3]
        source_alpha = source_bytes[index + 3]
        output_alpha = output_bytes[index + 3]

        if source_alpha == 0:
            result["transparent_pixels"] += 1
        else:
            result["visible_pixels"] += 1
        if source_alpha != output_alpha:
            result["alpha_mismatch_pixels"] += 1
        if source_rgb != output_rgb:
            if source_alpha == 0 and output_alpha == 0:
                result["transparent_rgb_mismatch_pixels"] += 1
            elif source_alpha > 0:
                result["visible_rgb_mismatch_pixels"] += 1

    result["rgba_visible_alpha_match"] = (
        result["alpha_mismatch_pixels"] == 0
        and result["visible_rgb_mismatch_pixels"] == 0
    )
    return result


def port_action(
    *,
    source_root: Path,
    project_root: Path,
    action_name: str,
    action: dict[str, Any],
    encoded_images: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    source_path = source_path_for_texture(source_root, action["texture"])
    source_relative = source_path.relative_to(source_root.resolve()).as_posix()
    encoded_image = encoded_images.get(source_relative)
    if encoded_image is None:
        output_name = f"{source_path.stem}.webp"
        output_path = project_root / TARGET_ASSET_DIR / output_name
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with Image.open(source_path) as source_image:
            source_rgba = source_image.convert("RGBA")
            source_rgba.load()
        source_rgba.save(output_path, format="WEBP", lossless=True, method=6)

        validation = compare_rgba(source_path, output_path)
    else:
        output_path = encoded_image["output_path"]
        validation = encoded_image["validation"]
    if not validation["rgba_visible_alpha_match"]:
        raise ValueError(f"{action_name} 轉檔後 RGBA 可見像素或 alpha 不一致：{validation}")

    if encoded_image is None:
        encoded_images[source_relative] = {
            "output_path": output_path,
            "validation": copy.deepcopy(validation),
        }

    output_name = output_path.name
    output_relative = output_path.relative_to(project_root).as_posix()
    texture_path = f"assets/motion/qiuqiu/{output_name}"
    ported_action = copy.deepcopy(action)
    ported_action["texture"] = texture_path

    with Image.open(source_path) as source_image:
        source_dimensions = list(source_image.size)
        source_mode = source_image.mode
    with Image.open(output_path) as output_image:
        output_dimensions = list(output_image.size)
        output_mode = output_image.mode

    duration = round(sum(float(frame["duration"]) for frame in action["frames"]), 6)
    record = {
        "action": action_name,
        "texture": texture_path,
        "frames": len(action["frames"]),
        "duration": duration,
        "scale": action["scale"],
        "source": {
            "path": source_relative,
            "bytes": source_path.stat().st_size,
            "sha256": sha256_file(source_path),
            "dimensions": source_dimensions,
            "mode": source_mode,
        },
        "output": {
            "path": output_relative,
            "bytes": output_path.stat().st_size,
            "sha256": sha256_file(output_path),
            "dimensions": output_dimensions,
            "mode": output_mode,
        },
        "validation": validation,
    }
    return ported_action, record


def port_projectile(
    *,
    source_root: Path,
    project_root: Path,
    projectile_name: str,
    texture: str,
    output_name: str,
) -> dict[str, Any]:
    source_path = source_path_for_texture(source_root, texture)
    source_relative = source_path.relative_to(source_root.resolve()).as_posix()
    output_path = project_root / TARGET_ASSET_DIR / output_name
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as source_image:
        source_rgba = source_image.convert("RGBA")
        source_rgba.load()
    source_rgba.save(output_path, format="WEBP", lossless=True, method=6)

    validation = compare_rgba(source_path, output_path)
    if not validation["rgba_visible_alpha_match"]:
        raise ValueError(
            f"{projectile_name} 轉檔後 RGBA 可見像素或 alpha 不一致：{validation}"
        )

    output_relative = output_path.relative_to(project_root).as_posix()
    texture_path = f"assets/motion/qiuqiu/{output_name}"
    with Image.open(source_path) as source_image:
        source_dimensions = list(source_image.size)
        source_mode = source_image.mode
    with Image.open(output_path) as output_image:
        output_dimensions = list(output_image.size)
        output_mode = output_image.mode

    return {
        "projectile": projectile_name,
        "texture": texture_path,
        "source": {
            "path": source_relative,
            "bytes": source_path.stat().st_size,
            "sha256": sha256_file(source_path),
            "dimensions": source_dimensions,
            "mode": source_mode,
        },
        "output": {
            "path": output_relative,
            "bytes": output_path.stat().st_size,
            "sha256": sha256_file(output_path),
            "dimensions": output_dimensions,
            "mode": output_mode,
        },
        "validation": validation,
    }


def run(source_root: Path | None = None) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[1]
    source_root = (source_root or default_source_root(project_root)).resolve()
    motions_path = source_root / MOTION_JSON
    if not motions_path.is_file():
        raise FileNotFoundError(f"找不到 motions.json：{motions_path}")

    motion_data = json.loads(motions_path.read_text(encoding="utf-8"))
    actions = motion_data.get("actions")
    if not isinstance(actions, dict):
        raise ValueError("motions.json 缺少 actions 物件")

    selected_actions: dict[str, Any] = {}
    records: list[dict[str, Any]] = []
    encoded_images: dict[str, dict[str, Any]] = {}
    for action_name in ACTION_NAMES:
        if action_name not in actions:
            raise KeyError(f"motions.json 缺少指定動作：{action_name}")
        ported_action, record = port_action(
            source_root=source_root,
            project_root=project_root,
            action_name=action_name,
            action=actions[action_name],
            encoded_images=encoded_images,
        )
        selected_actions[action_name] = ported_action
        records.append(record)

    projectile_records = [
        port_projectile(
            source_root=source_root,
            project_root=project_root,
            projectile_name=projectile_name,
            texture=texture,
            output_name=output_name,
        )
        for projectile_name, texture, output_name in PROJECTILE_SPECS
    ]

    json_write(project_root / TARGET_DATA, {"actions": selected_actions})

    output_records = [
        record["output"] for record in records + projectile_records
    ]
    unique_outputs = {output["path"]: output for output in output_records}
    action_outputs = {record["output"]["path"]: record["output"] for record in records}
    projectile_outputs = {
        record["output"]["path"]: record["output"]
        for record in projectile_records
    }
    unique_output_bytes = sum(output["bytes"] for output in unique_outputs.values())

    source_motions = {
        "path": MOTION_JSON.as_posix(),
        "bytes": motions_path.stat().st_size,
        "sha256": sha256_file(motions_path),
    }
    report = {
        "source": {
            "root": posix_path(source_root),
            "motions_json": source_motions,
        },
        "target": {
            "motion_data": TARGET_DATA.as_posix(),
            "asset_directory": TARGET_ASSET_DIR.as_posix(),
        },
        "actions": records,
        "projectiles": projectile_records,
        "summary": {
            "action_count": len(records),
            "projectile_count": len(projectile_records),
            "source_bytes": sum(record["source"]["bytes"] for record in records),
            "output_bytes": sum(record["output"]["bytes"] for record in records),
            "unique_action_image_count": len(action_outputs),
            "unique_action_output_bytes": sum(
                output["bytes"] for output in action_outputs.values()
            ),
            "unique_projectile_image_count": len(projectile_outputs),
            "unique_projectile_output_bytes": sum(
                output["bytes"] for output in projectile_outputs.values()
            ),
            "unique_image_count": len(unique_outputs),
            "unique_output_bytes": unique_output_bytes,
            "total_duration": round(sum(record["duration"] for record in records), 6),
            "all_dimensions_match": all(
                record["validation"]["dimensions_match"] for record in records
            ),
            "all_visible_pixels_and_alpha_match": all(
                record["validation"]["rgba_visible_alpha_match"] for record in records
            ),
            "all_projectile_dimensions_match": all(
                record["validation"]["dimensions_match"]
                for record in projectile_records
            ),
            "all_projectile_visible_pixels_and_alpha_match": all(
                record["validation"]["rgba_visible_alpha_match"]
                for record in projectile_records
            ),
        },
    }
    json_write(project_root / TARGET_DOC, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        help="Godot 專案根目錄（內含 assets/player/motions.json）；省略時自動尋找鄰近 GODOT 目錄。",
    )
    args = parser.parse_args()
    try:
        report = run(args.source)
    except (FileNotFoundError, KeyError, ValueError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(
        f"完成 {report['summary']['action_count']} 個動作；"
        f"另有 {report['summary']['projectile_count']} 個飛行物；"
        f"輸出 {report['summary']['output_bytes']} bytes；"
        f"動作可見像素與 alpha 驗證={report['summary']['all_visible_pixels_and_alpha_match']}；"
        f"飛行物可見像素與 alpha 驗證="
        f"{report['summary']['all_projectile_visible_pixels_and_alpha_match']}"
    )
    print(
        f"unique_image_count={report['summary']['unique_image_count']} "
        f"unique_output_bytes={report['summary']['unique_output_bytes']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
