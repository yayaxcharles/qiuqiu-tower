#!/usr/bin/env python3
"""Port the rat and ninja Godot frame libraries to browser-ready lossless WebP."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


TARGET_DATA = Path("src/ui/enemy-motion-data.json")
TARGET_DOC = Path("docs/enemy-motion-assets.json")
TARGET_ASSET_DIR = Path("public/assets/motion/enemies")

SOURCE_JSON = {
    "rat_frames": Path("assets/target/target_frames.json"),
    "rat_attack": Path("assets/target/attack_frames.json"),
    "rat_air": Path("assets/target/air_motions.json"),
    "ninja_ground": Path("assets/ninja/motions.json"),
    "ninja_air": Path("assets/ninja/air_motions.json"),
}

TEXTURE_OUTPUTS = {
    "assets/target/target_sheet.png": "rat-base.webp",
    "assets/target/attack_sheet.png": "rat-attack.webp",
    "assets/target/air_sheet.png": "rat-air.webp",
    "assets/ninja/motion_sheet.png": "ninja-ground.webp",
    "assets/ninja/air_sheet.png": "ninja-air.webp",
}

ACTION_NAMES = (
    "idle",
    "attack",
    "hurt",
    "air_rise",
    "air_fall",
    "knockdown",
    "getup",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def default_source_root(project_root: Path) -> Path:
    suffix = Path("qiuqiu-2d-motion-lab/qiuqiu-air-combat-v005")
    candidates: list[Path] = []
    ancestor = project_root.resolve()
    for _ in range(6):
        candidates.append(ancestor / "GODOT" / suffix)
        ancestor = ancestor.parent
    candidates.append(Path(project_root.anchor) / "GODOT" / suffix)
    for candidate in candidates:
        if (candidate / "scripts/main.gd").is_file():
            return candidate.resolve()
    raise FileNotFoundError(
        "找不到 Godot 來源；請用 --source 指向含 scripts/main.gd 的專案。"
    )


def source_path_for_texture(source_root: Path, texture: str) -> Path:
    prefix = "res://"
    if not texture.startswith(prefix):
        raise ValueError(f"texture 不是 res:// 路徑：{texture}")
    source_path = (source_root / texture[len(prefix) :]).resolve()
    try:
        source_path.relative_to(source_root.resolve())
    except ValueError as exc:
        raise ValueError(f"texture 超出來源專案：{texture}") from exc
    if not source_path.is_file():
        raise FileNotFoundError(f"找不到來源圖片：{source_path}")
    return source_path


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = min(1.0, max(0.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def apply_godot_chroma_shader(image: Image.Image) -> Image.Image:
    """Bake anchored_frame_player.gd's chroma shader into RGBA pixels."""

    source = image.convert("RGBA")
    converted: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in source.get_flattened_data():
        red_float = red / 255.0
        green_float = green / 255.0
        blue_float = blue / 255.0
        dominance = max(0.0, green_float - max(red_float, blue_float))
        alpha_mask = 1.0 - smoothstep(0.12, 0.35, dominance)
        despill = smoothstep(0.04, 0.30, dominance)
        neutral_green = max(red_float, blue_float) + 0.045
        output_green = green_float + (
            min(green_float, neutral_green) - green_float
        ) * despill
        converted.append(
            (
                red,
                round(min(1.0, max(0.0, output_green)) * 255),
                blue,
                round(alpha * alpha_mask),
            )
        )
    output = Image.new("RGBA", source.size)
    output.putdata(converted)
    return output


def compare_visible_rgba(expected: Image.Image, output_path: Path) -> dict[str, Any]:
    expected_rgba = expected.convert("RGBA")
    expected_rgba.load()
    with Image.open(output_path) as output_image:
        output_mode = output_image.mode
        output_rgba = output_image.convert("RGBA")
        output_rgba.load()

    result: dict[str, Any] = {
        "expected_dimensions": list(expected_rgba.size),
        "output_dimensions": list(output_rgba.size),
        "output_mode": output_mode,
        "dimensions_match": expected_rgba.size == output_rgba.size,
        "alpha_mismatch_pixels": 0,
        "visible_rgb_mismatch_pixels": 0,
        "visible_pixels": 0,
        "transparent_pixels": 0,
    }
    if expected_rgba.size != output_rgba.size:
        result["visible_pixels_and_alpha_match"] = False
        return result

    for expected_pixel, output_pixel in zip(
        expected_rgba.get_flattened_data(),
        output_rgba.get_flattened_data(),
        strict=True,
    ):
        expected_alpha = expected_pixel[3]
        output_alpha = output_pixel[3]
        if expected_alpha > 0:
            result["visible_pixels"] += 1
        else:
            result["transparent_pixels"] += 1
        if expected_alpha != output_alpha:
            result["alpha_mismatch_pixels"] += 1
        if expected_alpha > 0 and expected_pixel[:3] != output_pixel[:3]:
            result["visible_rgb_mismatch_pixels"] += 1

    result["visible_pixels_and_alpha_match"] = (
        result["visible_pixels"] > 0
        and result["alpha_mismatch_pixels"] == 0
        and result["visible_rgb_mismatch_pixels"] == 0
    )
    return result


def load_json(source_root: Path, relative: Path) -> dict[str, Any]:
    path = source_root / relative
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"JSON 根節點不是物件：{relative}")
    return data


def copy_action(action: dict[str, Any], texture_map: dict[str, str]) -> dict[str, Any]:
    result = copy.deepcopy(action)
    source_texture = str(result["texture"])[len("res://") :]
    result["texture"] = texture_map[source_texture]
    result.pop("chroma_key", None)
    return result


def build_motion_data(
    libraries: dict[str, dict[str, Any]], texture_map: dict[str, str]
) -> dict[str, Any]:
    rat_frames = libraries["rat_frames"]
    rat_attack = libraries["rat_attack"]
    rat_air = libraries["rat_air"]["actions"]
    ninja_ground = libraries["ninja_ground"]["actions"]
    ninja_air = libraries["ninja_air"]["actions"]

    if len(rat_frames.get("frames", [])) != 6:
        raise ValueError("老鼠 target_frames.json 應有 6 格")

    rat_idle = copy_action(rat_frames, texture_map)
    rat_idle["loop"] = True
    rat_idle["mirror"] = False  # 待機／受擊原圖朝左，不能沿用攻擊圖的鏡射設定。
    rat_idle["frames"] = copy.deepcopy(rat_frames["frames"][:1])
    rat_idle.pop("display_height", None)

    rat_hurt = copy_action(rat_frames, texture_map)
    rat_hurt["loop"] = False
    rat_hurt["mirror"] = False
    rat_hurt["frames"] = copy.deepcopy(rat_frames["frames"][1:])
    rat_hurt.pop("display_height", None)

    rat_actions = {
        "idle": rat_idle,
        "attack": copy_action(rat_attack, texture_map),
        "hurt": rat_hurt,
        **{
            name: copy_action(rat_air[name], texture_map)
            for name in ("air_rise", "air_fall", "knockdown", "getup")
        },
    }
    ninja_actions = {
        name: copy_action(
            ninja_ground[name] if name in {"idle", "attack", "hurt"} else ninja_air[name],
            texture_map,
        )
        for name in ACTION_NAMES
    }

    for kind, actions in (("rat", rat_actions), ("ninja", ninja_actions)):
        missing = set(ACTION_NAMES) - set(actions)
        if missing:
            raise ValueError(f"{kind} 缺少動作：{sorted(missing)}")
        for name, action in actions.items():
            if not action.get("frames"):
                raise ValueError(f"{kind}/{name} 沒有影格")

    return {
        "kinds": {
            "rat": {
                "native_height": 231,
                "default_height": 150,
                "mirror": True,
                "actions": rat_actions,
            },
            "ninja": {
                "native_height": 231,
                "default_height": 210,
                "mirror": True,
                "actions": ninja_actions,
            },
        }
    }


def frame_bottom_offsets(
    action: dict[str, Any], native_height: float, normalized_height: float
) -> list[float]:
    factor = normalized_height / native_height
    scale = float(action["scale"]) * factor
    return [
        round((float(frame["rect"][3]) - float(frame["pivot"][1])) * scale, 6)
        for frame in action["frames"]
    ]


def idle_visible_height(
    image: Image.Image, action: dict[str, Any]
) -> float:
    frame = action["frames"][0]
    x, y, width, height = (int(value) for value in frame["rect"])
    alpha = image.crop((x, y, x + width, y + height)).getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("待機影格沒有可見像素")
    return round((bounds[3] - bounds[1]) * float(action["scale"]), 6)


def run(source_root: Path | None = None) -> dict[str, Any]:
    project_root = Path(__file__).resolve().parents[1]
    source_root = (source_root or default_source_root(project_root)).resolve()
    libraries = {
        name: load_json(source_root, relative)
        for name, relative in SOURCE_JSON.items()
    }

    texture_consumers: dict[str, list[str]] = {}
    chroma_sources: set[str] = set()
    for library_name, library in libraries.items():
        actions = library.get("actions", {library_name: library})
        for action_name, action in actions.items():
            texture = str(action["texture"])[len("res://") :]
            texture_consumers.setdefault(texture, []).append(
                f"{library_name}/{action_name}"
            )
            if bool(action.get("chroma_key", False)):
                chroma_sources.add(texture)

    if set(texture_consumers) != set(TEXTURE_OUTPUTS):
        raise ValueError(
            "來源圖片集合與登錄不符："
            f"實際={sorted(texture_consumers)}，預期={sorted(TEXTURE_OUTPUTS)}"
        )

    output_dir = project_root / TARGET_ASSET_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    texture_map: dict[str, str] = {}
    processed_images: dict[str, Image.Image] = {}
    texture_records: list[dict[str, Any]] = []

    for source_relative, output_name in TEXTURE_OUTPUTS.items():
        source_path = source_root / source_relative
        with Image.open(source_path) as source_image:
            source_mode = source_image.mode
            expected = (
                apply_godot_chroma_shader(source_image)
                if source_relative in chroma_sources
                else source_image.convert("RGBA")
            )
            expected.load()

        output_path = output_dir / output_name
        expected.save(output_path, format="WEBP", lossless=True, method=6)
        validation = compare_visible_rgba(expected, output_path)
        if not validation["visible_pixels_and_alpha_match"]:
            raise ValueError(
                f"{source_relative} 的可見 RGB 或 alpha 驗證失敗：{validation}"
            )
        chunk = output_path.read_bytes()[12:16].decode("ascii", errors="replace")
        if chunk != "VP8L":
            raise ValueError(f"{output_path} 不是 VP8L 無損 WebP：{chunk}")

        public_texture = f"assets/motion/enemies/{output_name}"
        texture_map[source_relative] = public_texture
        processed_images[source_relative] = expected
        texture_records.append(
            {
                "source": {
                    "path": source_relative,
                    "bytes": source_path.stat().st_size,
                    "sha256": sha256_file(source_path),
                    "dimensions": list(expected.size),
                    "mode": source_mode,
                },
                "output": {
                    "path": output_path.relative_to(project_root).as_posix(),
                    "texture": public_texture,
                    "bytes": output_path.stat().st_size,
                    "sha256": sha256_file(output_path),
                    "dimensions": list(expected.size),
                    "mode": "RGBA",
                    "webp_chunk": chunk,
                },
                "consumers": texture_consumers[source_relative],
                "source_transform": (
                    "anchored_frame_player.gd chroma shader baked to alpha"
                    if source_relative in chroma_sources
                    else "RGBA conversion only"
                ),
                "validation": validation,
            }
        )

    motion_data = build_motion_data(libraries, texture_map)
    json_write(project_root / TARGET_DATA, motion_data)

    kind_records: dict[str, Any] = {}
    action_sources = {
        "rat": {
            "idle": "target_frames.json frame 1",
            "hurt": "target_frames.json frames 2-6",
            "attack": "attack_frames.json frames 1-8",
            "air_rise": "target/air_motions.json air_rise",
            "air_fall": "target/air_motions.json air_fall",
            "knockdown": "target/air_motions.json knockdown",
            "getup": "target/air_motions.json getup",
        },
        "ninja": {
            "idle": "ninja/motions.json idle",
            "attack": "ninja/motions.json attack",
            "hurt": "ninja/motions.json hurt",
            "air_rise": "ninja/air_motions.json air_rise",
            "air_fall": "ninja/air_motions.json air_fall",
            "knockdown": "ninja/air_motions.json knockdown",
            "getup": "ninja/air_motions.json getup",
        },
    }
    idle_source_texture = {
        "rat": "assets/target/target_sheet.png",
        "ninja": "assets/ninja/motion_sheet.png",
    }
    for kind, kind_data in motion_data["kinds"].items():
        native_height = float(kind_data["native_height"])
        normalized_height = float(kind_data["default_height"])
        actions = kind_data["actions"]
        kind_records[kind] = {
            "ready_actions": list(ACTION_NAMES),
            "native_height": int(native_height),
            "normalized_height": int(normalized_height),
            "idle_visible_height_from_alpha": idle_visible_height(
                processed_images[idle_source_texture[kind]], actions["idle"]
            ),
            "source_facing": "mixed" if kind == "rat" else "right",
            "canvas_facing": "left",
            "actions": {
                name: {
                    "source": action_sources[kind][name],
                    "frames": len(actions[name]["frames"]),
                    "duration_ms": round(
                        sum(float(frame["duration"]) for frame in actions[name]["frames"])
                        * 1000
                    ),
                    "texture": actions[name]["texture"],
                    "source_facing": "right" if actions[name].get("mirror", kind_data["mirror"]) else "left",
                }
                for name in ACTION_NAMES
            },
            "air_frame_bottom_offsets_at_normalized_height": {
                name: frame_bottom_offsets(
                    actions[name], native_height, normalized_height
                )
                for name in ("air_rise", "air_fall", "knockdown", "getup")
            },
        }

    source_json_records = {
        name: {
            "path": relative.as_posix(),
            "bytes": (source_root / relative).stat().st_size,
            "sha256": sha256_file(source_root / relative),
        }
        for name, relative in SOURCE_JSON.items()
    }
    report = {
        "source": {
            "root": source_root.as_posix(),
            "main_gd": "scripts/main.gd",
            "json": source_json_records,
        },
        "target": {
            "motion_data": TARGET_DATA.as_posix(),
            "asset_directory": TARGET_ASSET_DIR.as_posix(),
        },
        "textures": texture_records,
        "kinds": kind_records,
        "reuse_notes": {
            "rat": "待機取 target_frames 第 1 格；受傷取第 2-6 格，沒有新增或捏造影格。",
            "ninja": "所有要求動作都有獨立來源；未使用 motions.json 的 run。",
        },
        "summary": {
            "kind_count": len(kind_records),
            "unique_source_texture_count": len(texture_records),
            "output_texture_count": len(texture_records),
            "same_source_texture_deduplicated": len(texture_records)
            == len(texture_consumers),
            "all_outputs_vp8l": all(
                record["output"]["webp_chunk"] == "VP8L"
                for record in texture_records
            ),
            "all_visible_pixels_and_alpha_match": all(
                record["validation"]["visible_pixels_and_alpha_match"]
                for record in texture_records
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
        help="含 scripts/main.gd 的 qiuqiu-air-combat-v005 來源專案",
    )
    args = parser.parse_args()
    try:
        report = run(args.source)
    except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(
        f"完成 {report['summary']['unique_source_texture_count']} 張去重無損 WebP；"
        f"VP8L={report['summary']['all_outputs_vp8l']}；"
        "可見像素與 alpha="
        f"{report['summary']['all_visible_pixels_and_alpha_match']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
