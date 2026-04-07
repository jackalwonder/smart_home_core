from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw

from app.services import floor_plan_analysis_service


def test_analyze_floor_plan_image_extracts_room_candidates() -> None:
    image = Image.new("RGB", (320, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 300, 200), outline="black", width=6)
    draw.line((160, 20, 160, 200), fill="black", width=6)
    draw.line((20, 110, 160, 110), fill="black", width=6)
    draw.rectangle((58, 48, 92, 76), outline="black", width=3)

    buffer = BytesIO()
    image.save(buffer, format="PNG")

    analysis = floor_plan_analysis_service.analyze_floor_plan_image(
        buffer.getvalue(),
        ["客厅", "厨房", "主卧"],
    )

    assert analysis["source"] == "local-structure"
    assert analysis["image_width"] == 320
    assert analysis["image_height"] == 220
    assert len(analysis["room_candidates"]) >= 3
    assert len(analysis["wall_segments"]) >= 4
    assert analysis["openings"]
    assert analysis["furniture_candidates"]
