#!/usr/bin/env python3
"""카누맵 표기와 일본 위성지도 호수 라벨의 정적 회귀 점검."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    tour = (ROOT / "tour" / "index.html").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    lakes = json.loads((ROOT / "data" / "japan_lakes.json").read_text(encoding="utf-8"))

    assert manifest["name"] == "카누맵"
    assert manifest["short_name"] == "카누맵"
    assert "마이카누 지도" not in source + index + tour
    assert "마이카누 투어" not in source + index + tour
    assert "마이카누 카페" not in source + index + tour
    assert "cafe.naver.com/mytalon" not in source + index + tour
    assert '<h1>카누맵<span class="beta-tag">BETA</span></h1>' in index
    assert '<h1>카누맵 투어<span class="beta-tag">BETA</span></h1>' in tour

    assert lakes["source"] == "https://www.gsi.go.jp/kankyochiri/koshouchousa-list.html"
    assert len(lakes["items"]) >= 70
    assert any(item.get("ko") == "비와호" and item["name"] == "琵琶湖" for item in lakes["items"])
    assert all(24 <= item["lat"] <= 46 and 122 <= item["lng"] <= 150 for item in lakes["items"])
    assert "if(!map.hasLayer(baseSat))return" in source
    assert "baseSat.addLayer(japanLakeLabels)" in source
    place_kind = source[source.index("function setPlaceKind"):source.index("// ---- 통합 장소 오버라이드")]
    assert "fetch(fapi('/placeover')" in place_kind
    assert "fetch(fapi('/placecat')" not in place_kind
    assert "name:nm,memo:mo,cat:cat" in source
    print("branding and Japan lake labels regression: ok")


if __name__ == "__main__":
    main()
