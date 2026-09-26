#!/usr/bin/env python3
"""Build a nationwide Hanaro Mart GeoJSON snapshot from the official finder."""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import http.cookiejar
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "hanaro_stores.geojson"
BASE = "https://www.nhhanaro.co.kr"
SOURCE_URL = f"{BASE}/nahh_70005.do?id=nahh001_010100000000"
MAP_URL = f"{BASE}/nahh_70004.do?id=nahh001_010100000000&siteId=nahh001"
REGIONS = {
    "11": "서울", "42": "강원", "28": "인천", "41": "경기", "44": "충남",
    "43": "충북", "30": "대전", "47": "경북", "45": "전북", "27": "대구",
    "31": "울산", "46": "전남", "29": "광주", "48": "경남", "26": "부산",
    "50": "제주", "36": "세종",
}
THREAD = threading.local()


def opener() -> urllib.request.OpenerDirector:
    if not getattr(THREAD, "opener", None):
        jar = http.cookiejar.CookieJar()
        THREAD.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        request(THREAD.opener, MAP_URL)
    return THREAD.opener


def request(client: urllib.request.OpenerDirector, url: str, data: dict[str, str] | None = None) -> str:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={"User-Agent": "CanoeMap store-data updater (+https://canoe.crowdbase.kr/)"},
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with client.open(req, timeout=30) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            last_error = error
            time.sleep(0.4 * (attempt + 1))
    assert last_error is not None
    raise last_error


def plain(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def extract(label: str, page: str) -> str:
    match = re.search(rf"\[{re.escape(label)}\]</strong>\s*(.*?)</li>", page, re.S)
    return plain(match.group(1)) if match else ""


def detail(row: dict) -> dict | None:
    page = request(opener(), f"{BASE}/nahh_70004.do", {
        "boardId": "61", "siteId": "nahh001", "id": "nahh001_010100000000",
        "prov_c": row["provinceCode"], "ccw_c": row["districtCode"], "na_bzplc": row["id"],
    })
    coords = re.search(r"mapApi\.html\?locXcdn=([0-9.]+)&(?:amp;)?locYcdn=([0-9.]+)", page)
    if not coords:
        return None
    lng, lat = map(float, coords.groups())
    if not (32.5 <= lat <= 39.5 and 124 <= lng <= 132):
        return None
    summer, winter = extract("하절기 영업시간", page), extract("동절기 영업시간", page)
    hours = summer or winter
    if summer and winter and summer != winter:
        hours = f"하절기 {summer} · 동절기 {winter}"
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {
            "id": row["id"], "name": row["name"], "address": extract("지번주소", page),
            "phone": extract("대표전화", page), "hours": hours,
            "region": REGIONS.get(row["provinceCode"], row["provinceCode"]),
            "district": row["district"], "facilities": row["facilities"],
            "source": "농협경제지주 공식 전국마트찾기", "sourceUrl": SOURCE_URL,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--workers", type=int, default=5)
    args = parser.parse_args()

    client = opener()
    page = request(client, MAP_URL)
    districts: dict[tuple[str, str], str] = {}
    for province, district, name in re.findall(
        r"jf_changeCcwCList\('([^']+)','([^']+)'\)[^>]*>([^<]+)</a>", page
    ):
        districts[(province, district)] = plain(name)

    rows: dict[str, dict] = {}
    for index, ((province, district), district_name) in enumerate(districts.items(), 1):
        body = request(client, f"{BASE}/nahh_70002.do?siteId=nahh001", {"prov_c": province, "ccw_c": district})
        for raw in body.rstrip("@").split("@"):
            fields = raw.split("#")
            if len(fields) < 6 or not fields[0]:
                continue
            rows[fields[0]] = {
                "id": fields[0], "name": plain(fields[1]), "provinceCode": province,
                "districtCode": district, "district": district_name,
                "facilities": [label for label, flag in zip(("주유소", "문화센터", "은행", "식자재"), fields[2:6]) if flag == "1"],
            }
        if index % 40 == 0:
            print(f"districts {index}/{len(districts)} · stores {len(rows)}")

    features: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(detail, row): row for row in rows.values()}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                item = future.result()
                if item:
                    features.append(item)
            except Exception as error:
                row = futures[future]
                print(f"detail failed: {row['id']} {row['name']} ({error})")
            if index % 100 == 0:
                print(f"details {index}/{len(futures)} · valid {len(features)}")

    unique = {feature["properties"]["id"]: feature for feature in features}
    features = sorted(unique.values(), key=lambda f: (f["properties"]["region"], f["properties"]["district"], f["properties"]["name"]))
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    result = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "농협경제지주 공식 전국마트찾기", "sourceUrl": SOURCE_URL,
            "retrievedAt": now.isoformat(timespec="seconds"), "asOf": now.date().isoformat(),
            "count": len(features), "missingOfficialDetails": len(rows) - len(features),
        },
        "features": features,
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"saved {len(features)}/{len(rows)} stores -> {args.output}")


if __name__ == "__main__":
    main()
