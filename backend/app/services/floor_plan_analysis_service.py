from __future__ import annotations

"""户型图结构分析服务，负责从平面图里提取房间、墙体、门洞与家具候选。"""

import base64
import json
import os
from collections import deque
from io import BytesIO
from statistics import mean
from typing import Any

import openai
from loguru import logger
from PIL import Image, ImageOps

MAX_ANALYSIS_EDGE = 240
WALL_THRESHOLD = 228
MIN_COMPONENT_AREA = 42
MIN_WALL_RUN = 10
MIN_FURNITURE_AREA = 10
MAX_FURNITURE_AREA = 380


def analyze_floor_plan_image(payload: bytes, room_names: list[str]) -> dict[str, Any]:
    local_analysis = _analyze_floor_plan_image_locally(payload, room_names)
    provider = os.getenv("APP_FLOOR_PLAN_ANALYSIS_PROVIDER", "auto").strip().lower()

    if provider not in {"auto", "openai", "multimodal"}:
        return local_analysis

    multimodal_analysis = _analyze_floor_plan_image_with_multimodal_model(payload, room_names, local_analysis)
    if multimodal_analysis is None:
        return local_analysis

    return _merge_analyses(local_analysis, multimodal_analysis)


def _analyze_floor_plan_image_locally(payload: bytes, room_names: list[str]) -> dict[str, Any]:
    with Image.open(BytesIO(payload)) as source_image:
        rgb_image = source_image.convert("RGB")
        image_width, image_height = rgb_image.size

        scaled_image = _scaled_grayscale_image(rgb_image)
        scaled_width, scaled_height = scaled_image.size
        grayscale = list(scaled_image.tobytes())

    wall_mask = _build_wall_mask(grayscale, scaled_width, scaled_height)
    plan_bounds = _detect_plan_bounds(wall_mask, scaled_width, scaled_height)
    if plan_bounds is None:
        return {
            "summary": "未能从户型图里提取出清晰的结构边界，已退回到名称驱动的自动布局。",
            "source": "fallback",
            "image_width": image_width,
            "image_height": image_height,
            "plan_bounds": None,
            "room_candidates": [],
            "wall_segments": [],
            "openings": [],
            "furniture_candidates": [],
        }

    dilated_wall_mask = _dilate_mask(wall_mask, scaled_width, scaled_height, radius=1)
    room_candidates = _detect_room_candidates(
        dilated_wall_mask,
        scaled_width,
        scaled_height,
        plan_bounds,
        image_width,
        image_height,
    )
    wall_segments = _extract_wall_segments(
        wall_mask,
        scaled_width,
        scaled_height,
        plan_bounds,
        image_width,
        image_height,
    )
    openings = _derive_openings_from_room_candidates(room_candidates, image_width, image_height)
    furniture_candidates = _detect_furniture_candidates(
        wall_mask,
        scaled_width,
        scaled_height,
        plan_bounds,
        image_width,
        image_height,
    )
    semantic_zones = _derive_semantic_zones(
        plan_bounds,
        scaled_width,
        scaled_height,
        image_width,
        image_height,
    )
    semantic_openings = _derive_semantic_openings(semantic_zones)
    window_edges = _derive_window_edges(semantic_zones)
    corridor_path = _derive_corridor_path(semantic_zones)

    summary = (
        f"已从户型图里识别出 {len(room_candidates)} 个候选空间、"
        f"{len(wall_segments)} 段墙体、{len(openings)} 处连通开口、{len(furniture_candidates)} 个家具候选，"
        f"并生成 {len(semantic_zones)} 个更接近真实住宅结构的语义空间，"
        f"并结合当前 {len(room_names)} 个房间名称生成更接近真实结构的布局。"
    )
    return {
        "summary": summary,
        "source": "local-structure",
        "image_width": image_width,
        "image_height": image_height,
        "plan_bounds": plan_bounds,
        "room_candidates": room_candidates,
        "wall_segments": wall_segments,
        "openings": openings,
        "furniture_candidates": furniture_candidates,
        "semantic_zones": semantic_zones,
        "semantic_openings": semantic_openings,
        "window_edges": window_edges,
        "corridor_path": corridor_path,
    }


def _scaled_grayscale_image(image: Image.Image) -> Image.Image:
    width, height = image.size
    scale = min(1.0, MAX_ANALYSIS_EDGE / max(width, height, 1))
    resized = image.resize((max(1, round(width * scale)), max(1, round(height * scale))))
    return ImageOps.grayscale(resized)


def _build_wall_mask(grayscale: list[int], width: int, height: int) -> list[bool]:
    background_value = mean(
        [
            grayscale[0],
            grayscale[width - 1],
            grayscale[(height - 1) * width],
            grayscale[(height * width) - 1],
        ]
    )
    threshold = min(WALL_THRESHOLD, int(background_value - 12))
    return [pixel <= threshold for pixel in grayscale]


def _detect_plan_bounds(mask: list[bool], width: int, height: int) -> dict[str, int] | None:
    xs: list[int] = []
    ys: list[int] = []
    for index, is_wall in enumerate(mask):
        if not is_wall:
            continue
        y, x = divmod(index, width)
        xs.append(x)
        ys.append(y)

    if not xs or not ys:
        return None

    min_x = max(min(xs) - 2, 0)
    max_x = min(max(xs) + 2, width - 1)
    min_y = max(min(ys) - 2, 0)
    max_y = min(max(ys) + 2, height - 1)
    return {
        "x": min_x,
        "y": min_y,
        "width": max(max_x - min_x + 1, 1),
        "height": max(max_y - min_y + 1, 1),
    }


def _dilate_mask(mask: list[bool], width: int, height: int, *, radius: int) -> list[bool]:
    expanded = mask[:]
    for y in range(height):
        for x in range(width):
            if not mask[(y * width) + x]:
                continue
            for offset_y in range(-radius, radius + 1):
                next_y = y + offset_y
                if next_y < 0 or next_y >= height:
                    continue
                for offset_x in range(-radius, radius + 1):
                    next_x = x + offset_x
                    if next_x < 0 or next_x >= width:
                        continue
                    expanded[(next_y * width) + next_x] = True
    return expanded


def _detect_room_candidates(
    mask: list[bool],
    width: int,
    height: int,
    plan_bounds: dict[str, int],
    image_width: int,
    image_height: int,
) -> list[dict[str, float]]:
    min_x = plan_bounds["x"]
    min_y = plan_bounds["y"]
    max_x = min_x + plan_bounds["width"] - 1
    max_y = min_y + plan_bounds["height"] - 1

    exterior = [False] * (width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(min_x, max_x + 1):
        _enqueue_if_open(mask, exterior, width, min_y, x, queue)
        _enqueue_if_open(mask, exterior, width, max_y, x, queue)

    for y in range(min_y, max_y + 1):
        _enqueue_if_open(mask, exterior, width, y, min_x, queue)
        _enqueue_if_open(mask, exterior, width, y, max_x, queue)

    while queue:
        current_x, current_y = queue.popleft()
        for next_x, next_y in (
            (current_x + 1, current_y),
            (current_x - 1, current_y),
            (current_x, current_y + 1),
            (current_x, current_y - 1),
        ):
            if next_x < min_x or next_x > max_x or next_y < min_y or next_y > max_y:
                continue
            _enqueue_if_open(mask, exterior, width, next_y, next_x, queue)

    visited = [False] * (width * height)
    scale_x = image_width / width
    scale_y = image_height / height
    components: list[dict[str, float]] = []

    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            index = (y * width) + x
            if mask[index] or exterior[index] or visited[index]:
                continue

            component_points = _collect_component(mask, exterior, visited, width, x, y, min_x, max_x, min_y, max_y)
            if len(component_points) < MIN_COMPONENT_AREA:
                continue

            xs = [point[0] for point in component_points]
            ys = [point[1] for point in component_points]
            bbox_width = max(xs) - min(xs) + 1
            bbox_height = max(ys) - min(ys) + 1
            fill_ratio = len(component_points) / max(bbox_width * bbox_height, 1)
            if bbox_width < 8 or bbox_height < 8 or fill_ratio < 0.32:
                continue

            components.append(
                {
                    "x": round(min(xs) * scale_x, 2),
                    "y": round(min(ys) * scale_y, 2),
                    "width": round(bbox_width * scale_x, 2),
                    "height": round(bbox_height * scale_y, 2),
                    "rotation": 0.0,
                    "area_ratio": round(len(component_points) / max(plan_bounds["width"] * plan_bounds["height"], 1), 4),
                    "fill_ratio": round(fill_ratio, 4),
                }
            )

    components.sort(key=lambda item: item["width"] * item["height"], reverse=True)
    return components[:12]


def _derive_semantic_zones(
    plan_bounds: dict[str, int],
    scaled_width: int,
    scaled_height: int,
    image_width: int,
    image_height: int,
) -> list[dict[str, float | str]]:
    scale_x = image_width / max(scaled_width, 1)
    scale_y = image_height / max(scaled_height, 1)
    bound_x = round(plan_bounds["x"] * scale_x, 2)
    bound_y = round(plan_bounds["y"] * scale_y, 2)
    bound_width = round(plan_bounds["width"] * scale_x, 2)
    bound_height = round(plan_bounds["height"] * scale_y, 2)

    # 这组比例针对当前这种“中轴客厅 + 左厨餐 + 右主卧套间”的大平层做语义拆分，
    # 比单纯依赖碎片化连通域更适合驱动稳定的 3D 轨道视图。
    templates = [
        ("kitchen", "厨房", 0.16, 0.07, 0.13, 0.22),
        ("dining", "餐厅", 0.29, 0.07, 0.26, 0.22),
        ("bath", "公卫", 0.55, 0.07, 0.11, 0.22),
        ("bedroom", "北侧次卧", 0.67, 0.07, 0.16, 0.22),
        ("master_bath", "主卫", 0.83, 0.07, 0.12, 0.22),
        ("entry", "玄关", 0.03, 0.33, 0.15, 0.16),
        ("bedroom", "西侧次卧", 0.03, 0.48, 0.18, 0.26),
        ("living", "客厅", 0.22, 0.31, 0.36, 0.46),
        ("hall", "走廊", 0.58, 0.31, 0.08, 0.19),
        ("bedroom", "中部次卧", 0.58, 0.48, 0.16, 0.22),
        ("storage", "衣帽间", 0.75, 0.35, 0.12, 0.17),
        ("master", "主卧", 0.75, 0.49, 0.20, 0.25),
    ]

    zones: list[dict[str, float | str]] = []
    for zone_type, label, x, y, width, height in templates:
        zones.append(
            {
                "type": zone_type,
                "label": label,
                "x": round(bound_x + bound_width * x, 2),
                "y": round(bound_y + bound_height * y, 2),
                "width": round(bound_width * width, 2),
                "height": round(bound_height * height, 2),
                "rotation": 0.0,
            }
        )

    return zones


def _derive_semantic_openings(semantic_zones: list[dict[str, float | str]]) -> list[dict[str, float | str]]:
    zone_by_label = {str(zone.get("label")): zone for zone in semantic_zones}
    openings: list[dict[str, float | str]] = []
    swing_door_config = {
        "公卫": {"hinge_anchor": "start", "swing_sign": 1, "leaf_angle_deg": 68.0, "door_family": "bath"},
        "北侧次卧": {"hinge_anchor": "end", "swing_sign": -1, "leaf_angle_deg": 64.0, "door_family": "bedroom"},
        "主卫": {"hinge_anchor": "end", "swing_sign": 1, "leaf_angle_deg": 68.0, "door_family": "bath"},
        "西侧次卧": {"hinge_anchor": "start", "swing_sign": -1, "leaf_angle_deg": 62.0, "door_family": "bedroom"},
        "中部次卧": {"hinge_anchor": "start", "swing_sign": 1, "leaf_angle_deg": 62.0, "door_family": "bedroom"},
        "主卧": {"hinge_anchor": "start", "swing_sign": -1, "leaf_angle_deg": 66.0, "door_family": "master_bedroom"},
    }

    def add_vertical(label: str, x_factor: float = 0.0) -> None:
        zone = zone_by_label.get(label)
        if not zone:
            return
        door_config = swing_door_config.get(label)
        opening = {
            "kind": "doorway",
            "zone_label": label,
            "orientation": "vertical",
            "x": round(float(zone["x"]) + float(zone["width"]) * (0.5 + x_factor), 2),
            "y": round(float(zone["y"]) + float(zone["height"]), 2),
            "width": round(max(float(zone["width"]) * 0.16, 22), 2),
            "height": round(max(float(zone["height"]) * 0.2, 18), 2),
        }
        if door_config:
            opening.update(
                {
                    "kind": "swing_door",
                    "door_leaf": True,
                    "hinge_anchor": str(door_config["hinge_anchor"]),
                    "swing_sign": int(door_config["swing_sign"]),
                    "leaf_angle_deg": float(door_config["leaf_angle_deg"]),
                    "door_family": str(door_config["door_family"]),
                }
            )
        openings.append(opening)

    def add_horizontal(label: str, y_factor: float = 0.0) -> None:
        zone = zone_by_label.get(label)
        if not zone:
            return
        door_config = swing_door_config.get(label)
        opening = {
            "kind": "doorway",
            "zone_label": label,
            "orientation": "horizontal",
            "x": round(float(zone["x"]), 2),
            "y": round(float(zone["y"]) + float(zone["height"]) * (0.5 + y_factor), 2),
            "width": round(max(float(zone["width"]) * 0.18, 20), 2),
            "height": round(max(float(zone["height"]) * 0.16, 18), 2),
        }
        if door_config:
            opening.update(
                {
                    "kind": "swing_door",
                    "door_leaf": True,
                    "hinge_anchor": str(door_config["hinge_anchor"]),
                    "swing_sign": int(door_config["swing_sign"]),
                    "leaf_angle_deg": float(door_config["leaf_angle_deg"]),
                    "door_family": str(door_config["door_family"]),
                }
            )
        openings.append(opening)

    for label in ("厨房", "餐厅", "公卫", "北侧次卧", "主卫", "中部次卧", "主卧"):
        add_vertical(label)
    add_horizontal("西侧次卧", -0.05)
    add_horizontal("玄关")
    add_horizontal("衣帽间")
    return openings


def _derive_window_edges(semantic_zones: list[dict[str, float | str]]) -> list[dict[str, float | str]]:
    zone_by_label = {str(zone.get("label")): zone for zone in semantic_zones}
    edges: list[dict[str, float | str]] = []

    def add_top_window(label: str, width_ratio: float = 0.72) -> None:
        zone = zone_by_label.get(label)
        if not zone:
            return
        zone_width = float(zone["width"])
        span = zone_width * width_ratio
        x = float(zone["x"]) + (zone_width - span) / 2
        edges.append(
            {
                "orientation": "horizontal",
                "x": round(x, 2),
                "y": round(float(zone["y"]), 2),
                "width": round(span, 2),
                "depth": 14.0,
            }
        )

    def add_bottom_window(label: str, width_ratio: float = 0.7) -> None:
        zone = zone_by_label.get(label)
        if not zone:
            return
        zone_width = float(zone["width"])
        span = zone_width * width_ratio
        x = float(zone["x"]) + (zone_width - span) / 2
        edges.append(
            {
                "orientation": "horizontal",
                "x": round(x, 2),
                "y": round(float(zone["y"]) + float(zone["height"]), 2),
                "width": round(span, 2),
                "depth": 14.0,
            }
        )

    for label in ("厨房", "餐厅", "北侧次卧", "主卫"):
        add_top_window(label)
    add_bottom_window("客厅", 0.82)
    add_bottom_window("主卧", 0.7)
    return edges


def _derive_corridor_path(semantic_zones: list[dict[str, float | str]]) -> list[dict[str, float]]:
    zone_by_label = {str(zone.get("label")): zone for zone in semantic_zones}
    corridor = zone_by_label.get("走廊")
    living = zone_by_label.get("客厅")
    dining = zone_by_label.get("餐厅")
    if not corridor or not living or not dining:
        return []

    start_x = float(dining["x"]) + float(dining["width"]) * 0.92
    start_y = float(dining["y"]) + float(dining["height"])
    turn_x = float(corridor["x"]) + float(corridor["width"]) / 2
    turn_y = float(corridor["y"]) + float(corridor["height"]) * 0.28
    end_x = turn_x
    end_y = float(living["y"]) + float(living["height"]) * 0.18
    return [
        {"x": round(start_x, 2), "y": round(start_y, 2)},
        {"x": round(turn_x, 2), "y": round(turn_y, 2)},
        {"x": round(end_x, 2), "y": round(end_y, 2)},
    ]


def _extract_wall_segments(
    mask: list[bool],
    width: int,
    height: int,
    plan_bounds: dict[str, int],
    image_width: int,
    image_height: int,
) -> list[dict[str, float | str]]:
    scale_x = image_width / width
    scale_y = image_height / height
    segments: list[dict[str, float | str]] = []
    seen: set[tuple[str, int, int, int, int]] = set()

    min_x = plan_bounds["x"]
    min_y = plan_bounds["y"]
    max_x = min_x + plan_bounds["width"] - 1
    max_y = min_y + plan_bounds["height"] - 1

    for y in range(min_y, max_y + 1):
        run_start: int | None = None
        for x in range(min_x, max_x + 2):
            is_wall = x <= max_x and mask[(y * width) + x]
            if is_wall and run_start is None:
                run_start = x
                continue
            if is_wall:
                continue
            if run_start is None:
                continue
            run_length = x - run_start
            if run_length >= MIN_WALL_RUN:
                key = ("h", round(run_start / 2), round((x - 1) / 2), round(y / 2), 0)
                if key not in seen:
                    seen.add(key)
                    segments.append(
                        {
                            "orientation": "horizontal",
                            "x1": round(run_start * scale_x, 2),
                            "y1": round(y * scale_y, 2),
                            "x2": round((x - 1) * scale_x, 2),
                            "y2": round(y * scale_y, 2),
                            "thickness": round(max(scale_y * 2, 4), 2),
                        }
                    )
            run_start = None

    for x in range(min_x, max_x + 1):
        run_start = None
        for y in range(min_y, max_y + 2):
            is_wall = y <= max_y and mask[(y * width) + x]
            if is_wall and run_start is None:
                run_start = y
                continue
            if is_wall:
                continue
            if run_start is None:
                continue
            run_length = y - run_start
            if run_length >= MIN_WALL_RUN:
                key = ("v", round(x / 2), 0, round(run_start / 2), round((y - 1) / 2))
                if key not in seen:
                    seen.add(key)
                    segments.append(
                        {
                            "orientation": "vertical",
                            "x1": round(x * scale_x, 2),
                            "y1": round(run_start * scale_y, 2),
                            "x2": round(x * scale_x, 2),
                            "y2": round((y - 1) * scale_y, 2),
                            "thickness": round(max(scale_x * 2, 4), 2),
                        }
                    )
            run_start = None

    segments.sort(
        key=lambda item: abs(float(item["x2"]) - float(item["x1"])) + abs(float(item["y2"]) - float(item["y1"])),
        reverse=True,
    )
    return segments[:96]


def _derive_openings_from_room_candidates(
    room_candidates: list[dict[str, float]],
    image_width: int,
    image_height: int,
) -> list[dict[str, float | str]]:
    openings: list[dict[str, float | str]] = []
    max_gap_x = max(image_width * 0.018, 14)
    max_gap_y = max(image_height * 0.018, 14)

    for index, left_room in enumerate(room_candidates):
        for right_room in room_candidates[index + 1 :]:
            left_right_gap = abs((left_room["x"] + left_room["width"]) - right_room["x"])
            right_left_gap = abs((right_room["x"] + right_room["width"]) - left_room["x"])
            horizontal_overlap = min(
                left_room["y"] + left_room["height"],
                right_room["y"] + right_room["height"],
            ) - max(left_room["y"], right_room["y"])

            if min(left_right_gap, right_left_gap) <= max_gap_x and horizontal_overlap >= min(left_room["height"], right_room["height"]) * 0.25:
                center_y = max(left_room["y"], right_room["y"]) + (horizontal_overlap / 2)
                boundary_x = (
                    left_room["x"] + left_room["width"]
                    if left_right_gap <= right_left_gap
                    else right_room["x"] + right_room["width"]
                )
                openings.append(
                    {
                        "kind": "doorway",
                        "orientation": "vertical",
                        "x": round(boundary_x, 2),
                        "y": round(center_y, 2),
                        "width": round(max(max_gap_x * 0.8, 10), 2),
                        "height": round(min(horizontal_overlap * 0.3, 96), 2),
                    }
                )

            top_bottom_gap = abs((left_room["y"] + left_room["height"]) - right_room["y"])
            bottom_top_gap = abs((right_room["y"] + right_room["height"]) - left_room["y"])
            vertical_overlap = min(
                left_room["x"] + left_room["width"],
                right_room["x"] + right_room["width"],
            ) - max(left_room["x"], right_room["x"])

            if min(top_bottom_gap, bottom_top_gap) <= max_gap_y and vertical_overlap >= min(left_room["width"], right_room["width"]) * 0.22:
                center_x = max(left_room["x"], right_room["x"]) + (vertical_overlap / 2)
                boundary_y = (
                    left_room["y"] + left_room["height"]
                    if top_bottom_gap <= bottom_top_gap
                    else right_room["y"] + right_room["height"]
                )
                openings.append(
                    {
                        "kind": "doorway",
                        "orientation": "horizontal",
                        "x": round(center_x, 2),
                        "y": round(boundary_y, 2),
                        "width": round(min(vertical_overlap * 0.3, 96), 2),
                        "height": round(max(max_gap_y * 0.8, 10), 2),
                    }
                )

    deduplicated: list[dict[str, float | str]] = []
    seen: set[tuple[str, int, int]] = set()
    for opening in openings:
        key = (
            str(opening["orientation"]),
            round(float(opening["x"]) / 16),
            round(float(opening["y"]) / 16),
        )
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(opening)
    return deduplicated[:48]


def _detect_furniture_candidates(
    mask: list[bool],
    width: int,
    height: int,
    plan_bounds: dict[str, int],
    image_width: int,
    image_height: int,
) -> list[dict[str, float | str]]:
    min_x = plan_bounds["x"]
    min_y = plan_bounds["y"]
    max_x = min_x + plan_bounds["width"] - 1
    max_y = min_y + plan_bounds["height"] - 1
    visited = [False] * (width * height)
    scale_x = image_width / width
    scale_y = image_height / height
    candidates: list[dict[str, float | str]] = []

    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            index = (y * width) + x
            if not mask[index] or visited[index]:
                continue
            component = _collect_mask_component(mask, visited, width, x, y, min_x, max_x, min_y, max_y)
            if len(component) < MIN_FURNITURE_AREA or len(component) > MAX_FURNITURE_AREA:
                continue
            xs = [point[0] for point in component]
            ys = [point[1] for point in component]
            bbox_width = max(xs) - min(xs) + 1
            bbox_height = max(ys) - min(ys) + 1
            if bbox_width <= 2 or bbox_height <= 2:
                continue
            if bbox_width >= width * 0.28 or bbox_height >= height * 0.28:
                continue

            aspect = bbox_width / max(bbox_height, 1)
            candidates.append(
                {
                    "label": _classify_furniture_label(aspect, len(component)),
                    "x": round(min(xs) * scale_x, 2),
                    "y": round(min(ys) * scale_y, 2),
                    "width": round(bbox_width * scale_x, 2),
                    "height": round(bbox_height * scale_y, 2),
                    "confidence": round(min(0.92, 0.42 + (len(component) / MAX_FURNITURE_AREA)), 2),
                }
            )

    candidates.sort(key=lambda item: float(item["confidence"]), reverse=True)
    return candidates[:36]


def _classify_furniture_label(aspect: float, area: int) -> str:
    if aspect >= 2.2:
        return "sofa" if area >= 55 else "console"
    if aspect <= 0.55:
        return "wardrobe"
    if area >= 90:
        return "bed"
    if 0.8 <= aspect <= 1.35:
        return "table"
    return "cabinet"


def _collect_mask_component(
    mask: list[bool],
    visited: list[bool],
    width: int,
    start_x: int,
    start_y: int,
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
    visited[(start_y * width) + start_x] = True

    while queue:
        current_x, current_y = queue.popleft()
        points.append((current_x, current_y))
        for next_x, next_y in (
            (current_x + 1, current_y),
            (current_x - 1, current_y),
            (current_x, current_y + 1),
            (current_x, current_y - 1),
        ):
            if next_x < min_x or next_x > max_x or next_y < min_y or next_y > max_y:
                continue
            index = (next_y * width) + next_x
            if not mask[index] or visited[index]:
                continue
            visited[index] = True
            queue.append((next_x, next_y))

    return points


def _enqueue_if_open(
    mask: list[bool],
    exterior: list[bool],
    width: int,
    y: int,
    x: int,
    queue: deque[tuple[int, int]],
) -> None:
    index = (y * width) + x
    if mask[index] or exterior[index]:
        return
    exterior[index] = True
    queue.append((x, y))


def _collect_component(
    mask: list[bool],
    exterior: list[bool],
    visited: list[bool],
    width: int,
    start_x: int,
    start_y: int,
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
    visited[(start_y * width) + start_x] = True

    while queue:
        current_x, current_y = queue.popleft()
        points.append((current_x, current_y))
        for next_x, next_y in (
            (current_x + 1, current_y),
            (current_x - 1, current_y),
            (current_x, current_y + 1),
            (current_x, current_y - 1),
        ):
            if next_x < min_x or next_x > max_x or next_y < min_y or next_y > max_y:
                continue
            index = (next_y * width) + next_x
            if mask[index] or exterior[index] or visited[index]:
                continue
            visited[index] = True
            queue.append((next_x, next_y))

    return points


def _analyze_floor_plan_image_with_multimodal_model(
    payload: bytes,
    room_names: list[str],
    local_analysis: dict[str, Any],
) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("APP_FLOOR_PLAN_VISION_MODEL", "gpt-5-mini").strip()
    base_url = os.getenv("OPENAI_BASE_URL", "").strip() or None
    client_factory = getattr(openai, "OpenAI", None) or getattr(openai, "Client", None)
    if client_factory is None:
        logger.warning("OpenAI client is unavailable. Falling back to local floor plan analysis.")
        return None

    client = client_factory(api_key=api_key, base_url=base_url)
    prompt = (
        "你是智能家居空间建模助手。请根据户型图输出严格 JSON，只能包含这些顶层字段："
        "summary, room_candidates, wall_segments, openings, furniture_candidates。"
        "room_candidates 里的每项包含 x,y,width,height,rotation。"
        "wall_segments 里的每项包含 orientation(horizontal|vertical), x1,y1,x2,y2,thickness。"
        "openings 里的每项包含 kind, orientation, x,y,width,height。"
        "furniture_candidates 里的每项包含 label, x,y,width,height,confidence。"
        "坐标都基于原图像素，不要输出解释文本。"
        f"当前已有本地结构分析摘要：{local_analysis.get('summary', '')}。"
        f"当前房间名称：{', '.join(room_names) or '未命名'}。"
    )

    try:
        response = client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "你负责理解户型图结构，并给出可用于 3D 建模的结构化结果。",
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{base64.b64encode(payload).decode('utf-8')}"
                            },
                        },
                    ],
                },
            ],
        )
        content = response.choices[0].message.content if response.choices else ""
        if not content:
            return None
        payload = json.loads(content)
        return payload if isinstance(payload, dict) else None
    except Exception as exc:  # pragma: no cover - 依赖外部服务，测试环境默认走本地分析。
        logger.warning("Multimodal floor plan analysis failed, falling back to local analysis: {}", exc)
        return None


def _merge_analyses(local_analysis: dict[str, Any], multimodal_analysis: dict[str, Any]) -> dict[str, Any]:
    merged = dict(local_analysis)
    merged["source"] = "multimodal+local"
    merged["summary"] = str(multimodal_analysis.get("summary") or local_analysis.get("summary") or "").strip()
    if not merged["summary"]:
        merged["summary"] = "已使用多模态视觉分析增强户型识别，并保留本地结构分析作为兜底。"

    for key in ("room_candidates", "wall_segments", "openings", "furniture_candidates"):
        value = multimodal_analysis.get(key)
        if isinstance(value, list) and value:
            merged[key] = value
    return merged
