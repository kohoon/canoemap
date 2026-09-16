#!/usr/bin/env python3
"""Build compact named river/stream centerlines connected to South Korea."""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "rivers.geojson"
BOUNDARY_URL = "https://nominatim.openstreetmap.org/search?format=jsonv2&country=South%20Korea&polygon_geojson=1&limit=1"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
PENINSULA_BBOX = "33,124,43.2,132"
NORTH_AUDIT_BBOX = "37.5,124.5,39.5,129.5"
NAME_ALIASES = {
    # OSM의 공백 표기 차이로 본류와 북쪽 짧은 구간이 별도 검색 결과가 되지 않게 한다.
    "양양 남대천": "양양남대천",
}
# OSM에 이름이 없지만 공식 본류 구간인 선분.
FORCED_EXTENSIONS = [
    # 홍천강 원본 way 546163695·546166922(2026-08-06 확인).
    {"name": "홍천강", "kind": "river", "coordinates": [
        [128.012857, 37.858959], [128.014867, 37.854185], [128.019874, 37.847986],
        [128.020044, 37.846694], [128.019618, 37.84344], [128.018, 37.841046],
        [128.017864, 37.838706], [128.016553, 37.833702], [128.012278, 37.827205],
        [128.007697, 37.822039], [128.00429, 37.819362], [128.000731, 37.818824],
        [127.998772, 37.817196], [127.995928, 37.809998], [127.994719, 37.807831],
        [127.991074, 37.803633],
    ]},
    # 일리천의 이름 있는 way 131296958 끝부터 섬강 공유 노드까지 이어지는 하류
    # way 130242548(version 4, 2023-05-29, 2026-09-15 재확인).
    {"name": "일리천", "kind": "river", "coordinates": [
        [127.89414, 37.469201], [127.895214, 37.469172], [127.89692, 37.46798],
        [127.897982, 37.466873], [127.898256, 37.465328], [127.899956, 37.46606],
        [127.900938, 37.46566], [127.901195, 37.464233], [127.898594, 37.464152],
        [127.896571, 37.463109], [127.899929, 37.462666], [127.900638, 37.46207],
        [127.899495, 37.461144], [127.897081, 37.461466], [127.896394, 37.46107],
        [127.895257, 37.458608], [127.893444, 37.456888], [127.893986, 37.454307],
        [127.893691, 37.451774], [127.887516, 37.452855], [127.887506, 37.451109],
        [127.888368, 37.449257], [127.890413, 37.447843], [127.89452, 37.446553],
        [127.894828, 37.444934], [127.891824, 37.441369], [127.891201, 37.439401],
        [127.889032, 37.439627], [127.885687, 37.441113], [127.884775, 37.440887],
        [127.884572, 37.439293], [127.885494, 37.436818], [127.886484, 37.435956],
        [127.888445, 37.435208], [127.890928, 37.436147], [127.893042, 37.435489],
        [127.896298, 37.432645], [127.89692, 37.430332], [127.896073, 37.426826],
        [127.898118, 37.421672],
    ]},
    # 수입천의 이름 있는 way 372680760 북쪽 국경 끝부터 북한 상류까지 이어지는
    # 이름 없는 본류 way 242986174(version 1, 2013-10-21)·242986175
    # (version 7, 2017-08-17). 공유 노드로 정확히 연결되며 갈라지는 지류는 제외했다.
    {"name": "수입천", "kind": "river", "coordinates": [
        [127.985863, 38.289983], [127.983856, 38.292455], [127.983663, 38.295107],
        [127.982837, 38.296446], [127.981754, 38.299708], [127.981912, 38.301193],
        [127.981475, 38.301948], [127.98449, 38.305324], [127.983696, 38.307403],
        [127.985015, 38.309799], [127.985401, 38.312796], [127.986131, 38.314559],
        [127.985884, 38.31496], [127.986775, 38.318226], [127.986367, 38.320987],
        [127.984597, 38.322106], [127.981915, 38.32237], [127.981818, 38.323916],
        [127.982516, 38.326019], [127.982011, 38.326794], [127.981925, 38.327754],
        [127.978696, 38.329185], [127.979286, 38.331104], [127.978604, 38.332603],
        [127.976958, 38.333813], [127.976754, 38.334499], [127.977216, 38.33826],
        [127.976808, 38.339287], [127.975037, 38.341236], [127.97552, 38.342515],
        [127.975166, 38.34371], [127.976754, 38.345598], [127.974652, 38.348257],
        [127.974619, 38.349347], [127.975274, 38.34962], [127.973246, 38.352334],
        [127.973181, 38.352688], [127.974201, 38.353532], [127.974319, 38.354029],
        [127.973331, 38.35628], [127.973471, 38.357542], [127.974318, 38.358913],
        [127.97315, 38.359952], [127.972956, 38.361483], [127.975188, 38.363692],
        [127.974598, 38.365066], [127.973846, 38.365526], [127.973997, 38.366712],
        [127.97361, 38.367772], [127.974158, 38.369264], [127.97507, 38.370455],
        [127.974684, 38.37103], [127.975617, 38.372452], [127.975553, 38.37511],
        [127.976829, 38.376015], [127.979095, 38.376126], [127.981314, 38.377377],
        [127.985225, 38.378377], [127.986244, 38.380055], [127.987343, 38.380405],
        [127.988491, 38.380291],
    ]},
]


def fetch_json(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "mycanoe-map/1.0 river-build"})
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.load(res)


def inside_ring(x, y, ring):
    hit = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi:
            hit = not hit
        j = i
    return hit


_inside_cache = {}
def inside_country(lon, lat, polygons):
    key = (round(lon, 3), round(lat, 3))
    if key in _inside_cache:
        return _inside_cache[key]
    for bbox, poly in polygons:
        if lon < bbox[0] or lon > bbox[2] or lat < bbox[1] or lat > bbox[3]:
            continue
        if inside_ring(lon, lat, poly[0]) and not any(inside_ring(lon, lat, hole) for hole in poly[1:]):
            _inside_cache[key] = True
            return True
    _inside_cache[key] = False
    return False


def point_line_distance(p, a, b):
    x, y = p; x1, y1 = a; x2, y2 = b
    dx, dy = x2 - x1, y2 - y1
    if not dx and not dy:
        return math.hypot(x - x1, y - y1)
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(points, tolerance):
    if len(points) <= 2:
        return points
    best, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = point_line_distance(points[i], points[0], points[-1])
        if d > best:
            best, idx = d, i
    if best <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:idx + 1], tolerance)[:-1] + simplify(points[idx:], tolerance)


def runs_in_country(points, polygons):
    runs, current = [], []
    for p in points:
        if inside_country(p[0], p[1], polygons):
            current.append(p)
        else:
            if len(current) >= 2:
                runs.append(current)
            current = []
    if len(current) >= 2:
        runs.append(current)
    return runs


def merge_named_features(features, river_tolerance=0.04, stream_tolerance=0.0015):
    groups = {}
    for feature in features:
        p = feature["properties"]
        groups.setdefault(p["name"], []).append((p["kind"], feature["geometry"]["coordinates"]))
    merged = []
    for name, parts in groups.items():
        kind = "river" if any(k == "river" for k, _ in parts) else "stream"
        lines = [line for _, line in parts]
        tolerance = river_tolerance if kind == "river" else stream_tolerance
        while lines:
            chain = lines.pop()
            changed = True
            while changed:
                changed = False
                best = None
                for i, other in enumerate(lines):
                    choices = [
                        ((chain[-1][0]-other[0][0])**2+(chain[-1][1]-other[0][1])**2, "append"),
                        ((chain[-1][0]-other[-1][0])**2+(chain[-1][1]-other[-1][1])**2, "append_rev"),
                        ((chain[0][0]-other[-1][0])**2+(chain[0][1]-other[-1][1])**2, "prepend"),
                        ((chain[0][0]-other[0][0])**2+(chain[0][1]-other[0][1])**2, "prepend_rev"),
                    ]
                    dist, mode = min(choices)
                    if best is None or dist < best[0]:
                        best = (dist, i, mode)
                if best and best[0] <= tolerance * tolerance:
                    _, i, mode = best; other = lines.pop(i)
                    if mode == "append": chain += other[1:] if chain[-1] == other[0] else other
                    elif mode == "append_rev":
                        other.reverse(); chain += other[1:] if chain[-1] == other[0] else other
                    elif mode == "prepend": chain = (other[:-1] if other[-1] == chain[0] else other) + chain
                    else:
                        other.reverse(); chain = (other[:-1] if other[-1] == chain[0] else other) + chain
                    changed = True
            merged.append({"type": "Feature", "properties": {"name": name, "kind": kind}, "geometry": {"type": "LineString", "coordinates": chain}})
    return merged


def load_country_polygons():
    _inside_cache.clear()
    boundary = fetch_json(BOUNDARY_URL)[0]["geojson"]
    raw_polygons = boundary["coordinates"] if boundary["type"] == "MultiPolygon" else [boundary["coordinates"]]
    polygons = []
    for poly in raw_polygons:
        xs = [p[0] for p in poly[0]]
        ys = [p[1] for p in poly[0]]
        polygons.append(((min(xs), min(ys), max(xs), max(ys)), poly))
    return polygons


def named_features_from_overpass(raw, fallback_kind=None):
    features = []
    for way in raw.get("elements", []):
        tags = way.get("tags", {})
        kind = tags.get("waterway") or fallback_kind
        if kind not in ("river", "stream"):
            continue
        name = normalize_name(tags.get("name:ko") or tags.get("name"), tags)
        if not name:
            continue
        points = [[round(n["lon"], 6), round(n["lat"], 6)] for n in way.get("geometry", [])]
        coords = simplify(points, 0.00022 if kind == "river" else 0.00035)
        if len(coords) >= 2:
            features.append({"type": "Feature", "properties": {"name": name, "kind": kind},
                             "geometry": {"type": "LineString", "coordinates": coords}})
    return features


def connected_features_touching_country(features, polygons):
    # OSM way 분할·터널 등 200m 안팎의 미세 간격까지만 같은 국경 연결망으로 본다.
    components = merge_named_features(features, river_tolerance=0.002, stream_tolerance=0.0015)
    return [feature for feature in components if any(
        inside_country(lon, lat, polygons) for lon, lat in feature["geometry"]["coordinates"]
    )]


def cross_border_components(raw, polygons):
    components = connected_features_touching_country(named_features_from_overpass(raw), polygons)
    return [feature for feature in components if any(
        not inside_country(lon, lat, polygons) for lon, lat in feature["geometry"]["coordinates"]
    )]


def apply_north_extensions_to_existing(local_path=None, base_path=None):
    """Replace clipped border components with their connected North Korea geometry."""
    polygons = load_country_polygons()
    raw = load_north_overpass(local_path)
    # 국내 빌드가 동일 이름 주요 하천의 작은 간격을 이미 보완하므로, 북한 연결 조각도 같은
    # 최종 병합 규칙으로 먼저 합친다. 그렇지 않으면 한 조각을 교체하며 국내 가지가 빠질 수 있다.
    extensions = merge_named_features(cross_border_components(raw, polygons))
    source = Path(base_path) if base_path else OUT
    fc = json.loads(source.read_text(encoding="utf-8"))
    features = fc.get("features", [])
    changed = []
    for extension in extensions:
        name = extension["properties"]["name"]
        extension_coordinates = extension["geometry"]["coordinates"]
        extension_segments = list(zip(extension_coordinates, extension_coordinates[1:]))
        matched = []
        for i, feature in enumerate(features):
            if feature.get("properties", {}).get("name") != name:
                continue
            coordinates = feature.get("geometry", {}).get("coordinates", [])
            hits = sum(any(point_line_distance(point, a, b) <= 0.0005
                           for a, b in extension_segments) for point in coordinates)
            if coordinates and hits / len(coordinates) >= 0.8:
                matched.append(i)
        if not matched:
            continue
        first = matched[0]
        matched_set = set(matched)
        updated = []
        for i, feature in enumerate(features):
            if i == first:
                updated.append(extension)
            if i not in matched_set:
                updated.append(feature)
        features[:] = updated
        changed.append(name)
    OUT.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    names = sorted(set(changed))
    print(f"{OUT}: North-connected extensions applied to {', '.join(names) if names else 'none'}")


def apply_forced_extensions_to_existing():
    """Apply curated unnamed main-stem extensions without refreshing all OSM data."""
    fc = json.loads(OUT.read_text(encoding="utf-8"))
    features = fc.get("features", [])
    changed = []
    for extension in FORCED_EXTENSIONS:
        name = extension["name"]
        target = extension["coordinates"][-1]
        matches = [f for f in features if f.get("properties", {}).get("name") == name]
        if any(target in f.get("geometry", {}).get("coordinates", []) for f in matches):
            continue
        merged = merge_named_features(matches + [{
            "type": "Feature",
            "properties": {"name": name, "kind": extension["kind"]},
            "geometry": {"type": "LineString", "coordinates": extension["coordinates"]},
        }])
        updated = []
        inserted = False
        for feature in features:
            if feature.get("properties", {}).get("name") == name:
                if not inserted:
                    updated.extend(merged)
                    inserted = True
                continue
            updated.append(feature)
        features[:] = updated
        changed.append(name)
    OUT.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT}: extensions applied to {', '.join(changed) if changed else 'none'}")


def load_overpass(kind, local_path=None):
    if local_path:
        return json.loads(Path(local_path).read_text(encoding="utf-8"))
    query = f'[out:json][timeout:240];way["waterway"="{kind}"]["name"]({PENINSULA_BBOX});out tags geom;'
    return fetch_json(OVERPASS_URL + "?" + urllib.parse.urlencode({"data": query}))


def load_north_overpass(local_path=None):
    if local_path:
        return json.loads(Path(local_path).read_text(encoding="utf-8"))
    query = (f'[out:json][timeout:180];way["waterway"~"river|stream"]["name"]'
             f'({NORTH_AUDIT_BBOX});out tags geom;')
    return fetch_json(OVERPASS_URL + "?" + urllib.parse.urlencode({"data": query}))


def normalize_name(name, tags=None):
    name = str(name or "").strip()
    if "임진강" in name or "림진강" in name:
        return "임진강"
    # 북한에서는 본류가 `한탄천`으로 표기된다. 동명 지천을 잘못 합치지 않도록
    # Hantan River의 동일 Wikidata 수계인 경우에만 검색명 `한탄강`으로 통합한다.
    if name == "한탄천" and (tags or {}).get("wikidata") == "Q492822":
        return "한탄강"
    return NAME_ALIASES.get(name, name)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--extensions-only":
        apply_forced_extensions_to_existing()
        return
    if len(sys.argv) > 1 and sys.argv[1] == "--extend-north":
        local_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "-" else None
        base_path = sys.argv[3] if len(sys.argv) > 3 else None
        apply_north_extensions_to_existing(local_path, base_path)
        return
    river_path = sys.argv[1] if len(sys.argv) > 1 else None
    stream_path = sys.argv[2] if len(sys.argv) > 2 else None
    polygons = load_country_polygons()
    features = []
    for kind, path in (("river", river_path), ("stream", stream_path)):
        raw = load_overpass(kind, path)
        features.extend(named_features_from_overpass(raw, kind))
    features = connected_features_touching_country(features, polygons)
    for extension in FORCED_EXTENSIONS:
        features.append({"type": "Feature", "properties": {"name": extension["name"], "kind": extension["kind"]},
                         "geometry": {"type": "LineString", "coordinates": extension["coordinates"]}})
    features = merge_named_features(features)
    fc = {"type": "FeatureCollection", "features": features}
    OUT.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT}: {len(features)} segments, {OUT.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
