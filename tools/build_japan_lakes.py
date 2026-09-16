#!/usr/bin/env python3
"""일본 국토지리원 호수 조사 목록을 위성지도 라벨용 점 데이터로 만든다."""

import html
import json
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://www.gsi.go.jp/kankyochiri/koshouchousa-list.html"
OUT = ROOT / "data" / "japan_lakes.json"

KO = {
    "サロマ湖": "사로마호", "風蓮湖": "후렌호", "支笏湖": "시코쓰호", "洞爺湖": "도야호",
    "十和田湖": "도와다호", "桧原湖": "히바라호", "浜名湖": "하마나호", "琵琶湖": "비와호",
    "能取湖": "노토로호", "網走湖": "아바시리호", "屈斜路湖": "굿샤로호", "摩周湖": "마슈호",
    "阿寒湖": "아칸호", "小川原湖": "오가와라호", "田沢湖": "다자와호", "猪苗代湖": "이나와시로호",
    "霞ヶ浦": "가스미가우라호", "北浦": "기타우라", "中禅寺湖": "주젠지호", "印旛沼": "인바누마",
    "芦ノ湖": "아시노호", "河口湖": "가와구치호", "西湖": "사이호", "精進湖": "쇼지호",
    "本栖湖": "모토스호", "山中湖": "야마나카호", "野尻湖": "노지리호", "諏訪湖": "스와호",
    "中海": "나카우미", "宍道湖": "신지호", "池田湖": "이케다호", "十三湖": "주산호",
    "八郎潟調整池": "하치로가타 조정지", "阿蘇海": "아소카이", "湖山池": "고야마이케",
}


def main():
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "CanoeMap lake label builder/1.0"})
    text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    pattern = re.compile(
        r'href="https://maps\.gsi\.go\.jp/#(\d+)/([0-9.]+)/([0-9.]+)/[^\"]*"[^>]*>(.*?)</a>',
        re.I | re.S,
    )
    rows = []
    for zoom, lat, lng, raw_name in pattern.findall(text):
        name = html.unescape(re.sub(r"<[^>]+>", "", raw_name)).strip()
        name = re.sub(r"\s+", " ", name).rstrip("［[")
        if not name or not re.search(r"[湖沼浦池海湾]", name):
            continue
        source_zoom = int(zoom)
        min_zoom = 5 if source_zoom <= 12 else 6 if source_zoom == 13 else 7 if source_zoom == 14 else 8 if source_zoom == 15 else 9
        rows.append({
            "name": name,
            "ko": KO.get(re.sub(r"\([^)]*\)$", "", name), ""),
            "lat": round(float(lat), 6),
            "lng": round(float(lng), 6),
            "minZoom": min_zoom,
        })
    seen = set()
    unique = []
    for row in rows:
        key = (row["name"], row["lat"], row["lng"])
        if key not in seen:
            seen.add(key)
            unique.append(row)
    if len(unique) < 70:
        raise SystemExit(f"국토지리원 호수 파싱 결과가 너무 적습니다: {len(unique)}")
    OUT.write_text(json.dumps({"source": SOURCE, "items": unique}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"일본 호수 라벨 {len(unique)}곳 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
