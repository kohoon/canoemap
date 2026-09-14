#!/usr/bin/env python3
"""오프라인 팩, PWA 셸, 투어 전송 대기열의 정적 회귀 점검."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main():
    source = (ROOT / "tools" / "build_map.py").read_text(encoding="utf-8")
    worker = (ROOT / "workers" / "auth-worker.js").read_text(encoding="utf-8")
    service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))

    for output in (ROOT / "index.html", ROOT / "tour" / "index.html"):
        html = output.read_text(encoding="utf-8")
        assert '<link rel="manifest" href="./manifest.webmanifest">' in html
        assert "navigator.serviceWorker.register('./service-worker.js')" in html
        assert 'id="offlineModal"' in html
        assert "홈 화면에 추가" in html
        assert "Esri 위성영상" in html
        assert "CCTV·로드뷰·실시간 수위" in html

    for asset in ("service-worker.js", "manifest.webmanifest", "pwa-icon.svg"):
        assert (ROOT / "tour" / asset).read_bytes() == (ROOT / asset).read_bytes()

    assert manifest["display"] == "standalone"
    assert manifest["start_url"] == "./"
    assert "tile.openstreetmap.org" not in service_worker
    assert "mycanoe-offline-pack-v2-" in service_worker
    assert "protect_polygons|wlz|waterplay|rivers|roads" in service_worker
    assert "server.arcgisonline.com" in service_worker
    assert "World_Imagery\\/MapServer\\/tile" in service_worker

    offline_source = source[source.index("// ---- 코스 주변 오프라인 팩"):source.index("// ---- 범례는 레이어 패널에 통합됨")]
    assert "OFFLINE_ESRI_TEMPLATE" in offline_source
    assert "Esri World Imagery" in offline_source
    assert "OFFLINE_SAT_MAX_TILES=800" in source
    assert "api.vworld.kr" not in offline_source
    assert "satellite:{provider:'Esri World Imagery'" in offline_source
    assert "IndexedDB 저장본을 읽은 뒤 _offlineInit에서 추가" in source
    assert "!_offlinePack&&_offlineReady" in source

    # 저장 팩의 로그인 사용자 전용 장소는 동일한 현재 로그인 사용자에게만 복원한다.
    assert "String(pack.uid)===String(u.uid||'')" in source

    # 오프라인 대기열에는 인증 토큰을 넣지 않고, 전송할 때 현재 로그인에서 붙인다.
    queued_builder = source[source.index("function _tripQueuedItem"):source.index("async function _sendTripItem")]
    assert "tok:" not in queued_builder
    assert "Object.assign({},item.trip,{id:u.uid,tok:u.tok||''" in source

    # 같은 클라이언트 기록을 재전송해도 트립/코스가 중복 생성되지 않는다.
    assert 'const previous = clientId ? await KV.get("trip:" + id) : null' in worker
    assert 'String(x.clientId || "") === clientId' in worker
    print("offline mode regression: ok")


if __name__ == "__main__":
    main()
