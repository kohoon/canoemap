# 뉴질랜드 내수면 카누·카약 지도

2026-11-28 1차 조사. 북섬 17개·남섬 17개 수역, 좌표40개(물가 영상 후보4개·시설 및 수역 참고36개), DOC 공식 황가누이강 구간 안내4개.

- 운영 지도: https://canoe.crowdbase.kr/review/new-zealand-launch-20261128/
- 수역 링크 `#site=13`, 지점 `#site=13&point=1`, 코스 `#course=NZ02`.
- `research.json`이 정본. `data.js`는 같은 내용. `places.csv`와 `places.geojson`은 지점별 내보내기.
- DOC Campsites 공개 API의 공식 시설 대표점은 유지했다. 캠핑장 중심·주차장·호수 대표점을 실제 진수장으로 바꾸지 않았다.
- 시설 대표점18개를 Esri World Imagery·Esri Clarity·OSM으로 대조했다. 영상 촬영일은 미상이며 두 영상이 독립된 촬영 시점임을 보장하지 않는다. 영상 판독 호안 후보4개는 별도 지점으로 추가, 약20~40m 오차 가능성을 기록했다.
- 카누·카약 활동 안내는 개인 보트 반입·진수시설 이용권과 구분했다. 시설별 요금·접수·예약·도로·공고를 현장 전에 확인한다.
- 황가누이 코스의 명칭·거리·시간은 DOC 현재 안내 기준. 항적은 확보하지 못했으므로 선을 그리지 않고 출발·도착 참고 권역만 표시한다. 피피리키·타우마루누이는 마을/지역 좌표이며 검증된 회수·진수 호안이 아니다.
- MPI 담수조개 통제구역과 장비 세척, DOC 디디모 및 문화적 이용 조건을 관련 수역 출처에 연결했다. 모든 실시간 수위·수질·임시 폐쇄를 확인했다는 뜻이 아니다.
- 우클릭/길게 누르기로 좌표와 Esri 인근 주소를 조회·복사한다. 주소는 인근 지명으로 지번·발착 허가가 아니다. 조회 실패 시 좌표 복사는 유지한다. 주소는 데이터셋에 저장하지 않는다.
- 25개 도시와34개 수역 라벨을 한국어(영어·마오리어)로 표시한다. 시설 좌표 DOC CC BY4.0, 도시 GeoNames CC BY4.0. 각 지도 타일의 출처는 해당 제공자 표기를 따른다.

## 출처

- DOC 시설 좌표: https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/DOC_Campsites/FeatureServer/0
- DOC 공간자료: https://www.doc.govt.nz/our-work/maps-and-data/
- DOC 저작권: https://www.doc.govt.nz/footer-links/copyright/
- DOC 황가누이 저니: https://www.doc.govt.nz/whanganuijourney
- 뉴질랜드 관광청 한국어 지명: https://www.newzealand.com/kr/feature/whanganui-journey/
- 개별 활동·시설·규정 출처는 `research.json`의 각 항목에 수록.

## 검증

`NODE_PATH=/path/to/node_modules node tests/test_new_zealand_map.cjs`

PC1440px·모바일390px에서 목록/필터/전체마커유지/상세/CSV·GeoJSON/공유딥링크/좌표복사/주소조회/가로넘침을 점검한다. 실제 현장 진수 및 카누 항해는 검증하지 않았다.

## 2026-11-28 지명·수역 확장

- LINZ/NZGB Gazetteer 원본 54,752건 중 북·남섬 영역의 도시·마을·호수·주요 하천·산지 15,027건을 지명 레이어로 추가했다. 원본 SHA256·상태·지형 종류와 name_id를 JSON에 보존한다. 지명 대표좌표이며 물줄기나 호수 경계 형상이 아니다.
- Official 상태와 Unofficial Recorded만 수록하며 대체·폐기·수집 중 및 옛 원어 이름 항목은 제외했다. LINZ 제공 자료라는 뜻이며 모든 이름이 공식 승인됐다는 뜻은 아니다. 출처: https://gazetteer.linz.govt.nz/gaz.csv (LINZ / NZGB CC BY 4.0).
- 기존 한국어 병기 주요지명을 우선 표시하고 중복·겹침을 억제한다. 추가 원어 지명은 확대 수준에 따라 표시하며 한 화면 최대 PC160개·모바일80개다. 번역이 검수되지 않은 상세 지명은 원어를 유지한다. 레이어 제어에서 켜고 끌 수 있고 클릭을 가로채지 않는다.
- 갱신 재현: `python3 tools/nz/import_place_names.py /path/to/gaz.csv`. 자동 주기 갱신은 설정하지 않았다.
- 카이이위/타하로아·푸푸케·푸케티리니·카라피로·마라에타이·와카마루·로토마·로토에후·브러너·피어슨 10개 수역 추가. 지자체·DOC·관광기관·Fish & Game 출처와 이용 조건을 각 상세에 연결했다. 신규9개는 LINZ 수역 참고점, 피어슨은 DOC 캠핑장 대표점이며 새롭게 검증된 진수장으로 간주하지 않는다. 신규 좌표의 위성영상 대조는 아직 하지 않았다.
