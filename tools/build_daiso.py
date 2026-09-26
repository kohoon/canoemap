#!/usr/bin/env python3
"""Collect current Korean Daiso stores from the official regional store search.

The official page exposes one HTML result set per province/city, including the
store name, coordinates, address, phone, hours, opening date and facilities.
Future-opening stores are excluded until their opening date.
"""

from __future__ import annotations

import argparse
import html.parser
import json
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "daiso_stores.geojson"
SOURCE_URL = "https://www.daiso.co.kr/cs/ajax/shop_search"
REGIONS = [
    "서울", "경기", "인천", "강원", "광주", "대전", "울산", "세종",
    "충북", "충남", "전북", "전남", "경북", "경남", "대구", "부산", "제주",
]


def read_url(url: str, attempts: int = 3) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "CanoeMap store-data updater (+https://canoe.crowdbase.kr/)"},
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(0.35 * (attempt + 1))
    assert last_error is not None
    raise last_error


class StoreParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stores: list[dict] = []
        self.current: dict | None = None
        self.div_depth = 0
        self.capture: str | None = None
        self.buffer: list[str] = []
        self.in_options = False

    @staticmethod
    def _classes(attrs: dict[str, str | None]) -> set[str]:
        return set((attrs.get("class") or "").split())

    def handle_starttag(self, tag: str, attrs_raw: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs_raw)
        classes = self._classes(attrs)
        if tag == "div" and self.current is None and "bx-store" in classes:
            self.current = {
                "lat": float(attrs["data-lat"]),
                "lng": float(attrs["data-lng"]),
                "start": attrs.get("data-start") or "",
                "end": attrs.get("data-end") or "",
                "opnday": attrs.get("data-opnday") or "",
                "name": "",
                "address": "",
                "phone": "",
                "options": [],
            }
            self.div_depth = 1
            return
        if self.current is None:
            return
        if tag == "div":
            self.div_depth += 1
        if tag == "h4" and "place" in classes:
            self.capture, self.buffer = "name", []
        elif tag == "p" and "addr" in classes:
            self.capture, self.buffer = "address", []
        elif tag == "em" and "phone" in classes:
            self.capture, self.buffer = "phone", []
        elif tag == "ul" and "opts" in classes:
            self.in_options = True
        elif tag == "span" and self.in_options:
            self.capture, self.buffer = "option", []

    def handle_data(self, data: str) -> None:
        if self.current is not None and self.capture:
            self.buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.current is None:
            return
        targets = {"h4": "name", "p": "address", "em": "phone", "span": "option"}
        if tag in targets and self.capture == targets[tag]:
            value = " ".join("".join(self.buffer).split())
            if self.capture == "option":
                if value:
                    self.current["options"].append(value)
            else:
                self.current[self.capture] = value
            self.capture, self.buffer = None, []
        if tag == "ul" and self.in_options:
            self.in_options = False
        if tag == "div":
            self.div_depth -= 1
            if self.div_depth == 0:
                self.stores.append(self.current)
                self.current = None


def fetch_stores(region: str, gugun: str = "", dong: str = "") -> list[dict]:
    query = urllib.parse.urlencode({"sido": region, "gugun": gugun, "dong": dong})
    body = read_url(f"{SOURCE_URL}?{query}")
    parser = StoreParser()
    parser.feed(body)
    for store in parser.stores:
        store["region"] = region
    return parser.stores


def fetch_values(endpoint: str, params: dict[str, str]) -> list[str]:
    query = urllib.parse.urlencode(params)
    body = read_url(f"https://www.daiso.co.kr/cs/ajax/{endpoint}?{query}")
    return [str(item["value"]) for item in json.loads(body) if item.get("value")]


def valid_on(store: dict, as_of: date) -> bool:
    raw = str(store.get("opnday") or "")
    if len(raw) == 8 and raw.isdigit():
        return datetime.strptime(raw, "%Y%m%d").date() <= as_of
    return True


def feature(store: dict) -> dict:
    phone = str(store.get("phone") or "").removeprefix("T.").strip()
    hours = ""
    if store.get("start") and store.get("end"):
        start, end = str(store["start"]), str(store["end"])
        if len(start) == 4 and len(end) == 4:
            hours = f"{start[:2]}:{start[2:]}–{end[:2]}:{end[2:]}"
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [store["lng"], store["lat"]]},
        "properties": {
            "name": store["name"],
            "address": store["address"],
            "phone": phone,
            "hours": hours,
            "openingDate": store.get("opnday") or "",
            "region": store["region"],
            "options": store.get("options") or [],
            "source": "㈜아성다이소 공식 매장검색",
            "sourceUrl": "https://www.daiso.co.kr/cs/shop",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="YYYY-MM-DD; defaults to today's date in Asia/Seoul")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--delay", type=float, default=0.08, help="delay between official-site requests")
    args = parser.parse_args()
    as_of = date.fromisoformat(args.as_of) if args.as_of else datetime.now(ZoneInfo("Asia/Seoul")).date()

    rows: list[dict] = []
    for region in REGIONS:
        subdivisions = fetch_values("sido_search", {"sido": region})
        time.sleep(args.delay)
        region_rows: list[dict] = []
        if region == "세종":
            for dong in subdivisions:
                region_rows.extend(fetch_stores(region, dong=dong))
                time.sleep(args.delay)
        else:
            for gugun in subdivisions:
                failed = False
                try:
                    found = fetch_stores(region, gugun=gugun)
                except (urllib.error.HTTPError, urllib.error.URLError) as error:
                    print(f"  {region} {gugun}: district query failed ({error}); falling back to dong scopes")
                    found, failed = [], True
                time.sleep(args.delay)
                region_rows.extend(found)
                # The official result pane is capped at 10. Split capped districts
                # into official dong scopes so no stores beyond the first 10 are lost.
                # Some districts return HTTP 500 at district scope but work by dong.
                if failed or len(found) >= 10:
                    dongs = fetch_values("gugun_search", {"sido": region, "gugun": gugun})
                    time.sleep(args.delay)
                    for dong in dongs:
                        region_rows.extend(fetch_stores(region, gugun=gugun, dong=dong))
                        time.sleep(args.delay)
        print(f"{region}: {len(region_rows)} raw rows from {len(subdivisions)} subdivisions")
        rows.extend(region_rows)

    unique: dict[tuple, dict] = {}
    for store in rows:
        if not valid_on(store, as_of):
            continue
        lat, lng = float(store["lat"]), float(store["lng"])
        if not (32.5 <= lat <= 39.5 and 124.0 <= lng <= 132.0 and store.get("name")):
            continue
        key = (store["name"].replace(" ", ""), round(lat, 7), round(lng, 7))
        unique[key] = store

    features = [feature(store) for store in unique.values()]
    features.sort(key=lambda item: (item["properties"]["region"], item["properties"]["name"]))
    result = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "㈜아성다이소 공식 매장검색",
            "sourceUrl": "https://www.daiso.co.kr/cs/shop",
            "retrievedAt": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
            "asOf": as_of.isoformat(),
            "count": len(features),
        },
        "features": features,
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"saved {len(features)} stores -> {args.output}")


if __name__ == "__main__":
    main()
