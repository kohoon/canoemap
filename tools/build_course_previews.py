#!/usr/bin/env python3
"""코스 공유용 1200×630 JPEG와 Cloudflare KV bulk payload를 만든다.

기본은 정적 data/courses.geojson을 처리한다. 운영 KV에서 받은 courses JSON을
--courses-json으로 넘기면 등록 코스도 함께 만든다. 원본 사용자/소유자 정보는
출력하지 않고 공개 코스의 이름·거리·경로만 이미지에 사용한다.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SIZE = (1200, 630)
COLORS = {
    "ink": "#14231e", "muted": "#5d6d65", "land": "#edf2e6",
    "land2": "#e1ead8", "river": "#9cc7d1", "surface": "#ffffff",
    "border": "#cbd8cf", "route": "#d500f9",
}
FONT_CANDIDATES = (
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default(size=size)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, size: int, minimum: int = 15):
    text = str(text or "")
    while size > minimum:
        fnt = font(size)
        if draw.textbbox((0, 0), text, font=fnt)[2] <= max_width:
            return text, fnt
        size -= 1
    fnt = font(size)
    while len(text) > 1 and draw.textbbox((0, 0), text + "…", font=fnt)[2] > max_width:
        text = text[:-1]
    return text + ("…" if text else ""), fnt


def text(draw: ImageDraw.ImageDraw, xy, value, width, size, fill):
    value, fnt = fit_text(draw, value, width, size)
    draw.text(xy, value, font=fnt, fill=fill)


def labels(name: str):
    name = str(name or "카누맵 코스").strip()
    if " - " in name:
        title, route = name.split(" - ", 1)
    else:
        title, route = name, ""
    ends = re.split(r"\s+(?:~|→)\s+", route, maxsplit=1)
    return title, ends[0] if ends and ends[0] else "코스 출발점", ends[1] if len(ends) > 1 else "코스 도착점"


def project_factory(coords, frame=(500, 38, 658, 554)):
    def merc(point):
        lat = max(-85.0, min(85.0, float(point[0]))) * math.pi / 180
        return float(point[1]) * math.pi / 180, math.log(math.tan(math.pi / 4 + lat / 2))

    points = [merc(point) for point in coords]
    xs, ys = [point[0] for point in points], [point[1] for point in points]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    x, y, width, height = frame
    scale = min((width - 68) / max(1e-7, max_x - min_x), (height - 48) / max(1e-7, max_y - min_y))
    center_x, center_y = (min_x + max_x) / 2, (min_y + max_y) / 2

    def project(point):
        mx, my = merc(point)
        return x + width / 2 + (mx - center_x) * scale, y + height / 2 - (my - center_y) * scale

    return project


def nearby_rivers(coords, rivers):
    lats, lngs = [p[0] for p in coords], [p[1] for p in coords]
    south, north, west, east = min(lats), max(lats), min(lngs), max(lngs)
    pad_y, pad_x = max(0.025, (north - south) * 0.35), max(0.025, (east - west) * 0.35)
    selected = []
    for feature in rivers.get("features", []):
        line = (feature.get("geometry") or {}).get("coordinates") or []
        if not any(west - pad_x <= p[0] <= east + pad_x and south - pad_y <= p[1] <= north + pad_y for p in line):
            continue
        selected.append({
            "kind": (feature.get("properties") or {}).get("kind", ""),
            "coords": [[p[1], p[0]] for p in line],
        })
        if len(selected) >= 45:
            break
    return selected


def render(course, rivers):
    coords = [[float(p[0]), float(p[1])] for p in course["coords"] if len(p) >= 2]
    image = Image.new("RGB", SIZE, COLORS["land"])
    draw = ImageDraw.Draw(image)
    for x in range(-600, 1400, 42):
        draw.line((x, 630, x + 364, 0), fill=COLORS["land2"], width=1)

    project = project_factory(coords)
    frame_mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(frame_mask).rectangle((500, 38, 1158, 592), fill=255)
    water = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    water_draw = ImageDraw.Draw(water)
    for line in nearby_rivers(coords, rivers):
        points = [project(p) for p in line["coords"]]
        if len(points) >= 2:
            alpha = 184 if line["kind"] == "river" else 112
            width = 6 if line["kind"] == "river" else 3
            water_draw.line(points, fill=(156, 199, 209, alpha), width=width, joint="curve")
    image.paste(water.convert("RGB"), (0, 0), Image.composite(water, Image.new("RGBA", SIZE), frame_mask).getchannel("A"))
    draw = ImageDraw.Draw(image)
    route = [project(p) for p in coords]
    draw.line(route, fill="#ffffff", width=14, joint="curve")
    color = str(course.get("color") or "")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = COLORS["route"]
    draw.line(route, fill=color, width=8, joint="curve")

    for point, marker_color, marker_label, side in ((route[0], "#13a26f", "출발", 1), (route[-1], "#ef5b5b", "도착", -1)):
        x, y = point
        draw.ellipse((x - 17, y - 17, x + 17, y + 17), fill="#ffffff")
        draw.ellipse((x - 11, y - 11, x + 11, y + 11), fill=marker_color)
        fnt = font(19)
        box = draw.textbbox((0, 0), marker_label, font=fnt, stroke_width=5)
        width = box[2] - box[0]
        tx = x + 25 if side > 0 else x - 25 - width
        draw.text((tx, y - 11), marker_label, font=fnt, fill=COLORS["ink"], stroke_width=5, stroke_fill="#ffffff")

    shadow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((42, 42, 472, 588), radius=26, fill=(21, 45, 37, 65))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    image.paste(shadow, (0, 5), shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((42, 42, 472, 588), radius=26, fill=COLORS["surface"], outline=COLORS["border"])

    title, start, end = labels(course.get("name", ""))
    text(draw, (76, 85), "카누맵 · 추천 코스", 362, 20, COLORS["muted"])
    text(draw, (76, 130), title, 362, 40, COLORS["ink"])
    draw.line((76, 192, 438, 192), fill=COLORS["border"], width=1)
    text(draw, (76, 220), "출발", 362, 18, COLORS["muted"])
    text(draw, (76, 251), start, 362, 25, COLORS["ink"])
    text(draw, (76, 307), "도착", 362, 18, COLORS["muted"])
    text(draw, (76, 338), end, 362, 25, COLORS["ink"])
    draw.rounded_rectangle((76, 407, 438, 495), radius=18, fill=COLORS["land2"])
    text(draw, (100, 424), "전체 거리", 314, 17, COLORS["muted"])
    km = round(float(course.get("km") or 0), 2)
    text(draw, (100, 451), f"{km:g} km", 314, 32, COLORS["ink"])
    text(draw, (76, 532), "전체 코스를 지도에서 확인하세요 →", 362, 19, color)
    draw.rounded_rectangle((1026, 548, 1142, 590), radius=21, fill="#ffffff", outline=COLORS["border"])
    brand = font(18)
    brand_box = draw.textbbox((0, 0), "카누맵", font=brand)
    draw.text((1084 - (brand_box[2] - brand_box[0]) / 2, 558), "카누맵", font=brand, fill=COLORS["ink"])

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=86, optimize=True, progressive=True)
    return output.getvalue()


def load_static_courses():
    geojson = json.loads((ROOT / "data/courses.geojson").read_text(encoding="utf-8"))
    ids = json.loads((ROOT / "data/course_ids.json").read_text(encoding="utf-8"))["ids"]
    out = []
    for feature in geojson.get("features", []):
        properties = feature.get("properties") or {}
        name = properties.get("name", "")
        out.append({
            "id": str(ids[name]), "name": name, "km": properties.get("km", 0),
            "color": properties.get("color", ""),
            "coords": [[p[1], p[0]] for p in (feature.get("geometry") or {}).get("coordinates", [])],
        })
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--courses-json", type=Path, help="wrangler로 받은 등록 코스 배열 JSON")
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".course-preview-build")
    args = parser.parse_args()
    rivers = json.loads((ROOT / "rivers.geojson").read_text(encoding="utf-8"))
    courses = load_static_courses()
    if args.courses_json:
        for course in json.loads(args.courses_json.read_text(encoding="utf-8")):
            if not re.fullmatch(r"[0-9]{8,24}", str(course.get("id", ""))):
                continue
            coords = course.get("coords") or []
            if len(coords) < 2:
                continue
            courses.append({
                "id": "k" + str(course["id"]), "name": str(course.get("name") or "카누맵 코스"),
                "km": course.get("km", 0), "color": course.get("color", ""), "coords": coords,
            })
    args.output_dir.mkdir(parents=True, exist_ok=True)
    bulk = []
    for course in courses:
        jpeg = render(course, rivers)
        revision = hashlib.sha256(jpeg).hexdigest()[:12]
        (args.output_dir / f"{course['id']}.jpg").write_bytes(jpeg)
        record = json.dumps({"v": revision, "b64": base64.b64encode(jpeg).decode("ascii")}, separators=(",", ":"))
        bulk.append({"key": "course_preview:" + course["id"], "value": record})
        print(f"{course['id']}: {course['name']} ({len(jpeg) // 1024}KB)")
    (args.output_dir / "kv-bulk.json").write_text(json.dumps(bulk, ensure_ascii=False), encoding="utf-8")
    print(f"{len(courses)} previews -> {args.output_dir}")


if __name__ == "__main__":
    main()
