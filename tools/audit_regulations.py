#!/usr/bin/env python3
"""Audit inland regulation evidence without asserting legal boundary verification."""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from shapely.geometry import shape
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]


def audit_feature(feature, dataset, today):
    p = feature.get('properties', {})
    issues = []
    try:
        geometry = shape(feature['geometry'])
        if geometry.is_empty or geometry.geom_type not in ('Polygon', 'MultiPolygon'):
            issues.append('empty_or_non_polygon')
        if not geometry.is_valid:
            issues.append('invalid_geometry: ' + explain_validity(geometry))
        if geometry.bounds and not (124 <= geometry.bounds[0] <= geometry.bounds[2] <= 132 and
                                    32.5 <= geometry.bounds[1] <= geometry.bounds[3] <= 39.5):
            issues.append('outside_supported_area')
    except Exception:
        issues.append('unreadable_geometry')
    notice = p.get('noticeUrl') or p.get('sourceUrl')
    if not notice:
        issues.append('missing_notice_document')
    if not p.get('boundaryVerifiedAt'):
        issues.append('notice_boundary_not_verified')
    period = str(p.get('period', ''))
    dates = re.findall(r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', period)
    if len(dates) >= 2:
        try:
            end = datetime(*map(int, dates[-1])).date()
            if end < today:
                issues.append('stated_period_ended_recheck_notice')
        except ValueError:
            issues.append('invalid_period')
    target = str(p.get('target', ''))
    if dataset == 'inland_leisure' and not target:
        issues.append('missing_target_craft')
    note = str(p.get('note', ''))
    if dataset == 'inland_leisure' and ('대략' in note or not p.get('boundaryVerifiedAt')):
        issues.append('approximate_boundary')
    return {
        'id': p.get('mnum') or p.get('name'), 'dataset': dataset,
        'name': p.get('name') or p.get('s', ''),
        'noticeNumber': '/'.join(str(p.get(k, '')) for k in ('dyear', 'dnum')).strip('/'),
        'period': period, 'target': target,
        'canoeApplicability': ('motor_only_not_canoe_ban' if target.startswith('동력')
                               else 'requires_notice_review'),
        'geometrySha256': hashlib.sha256(json.dumps(feature.get('geometry'), sort_keys=True).encode()).hexdigest(),
        'issues': issues,
    }


def run(root=ROOT, checked_at=None):
    checked_at = checked_at or datetime.now(ZoneInfo('Asia/Seoul'))
    records, sources = [], {}
    for dataset, name in [('water_protection', 'protect_polygons.geojson'),
                          ('inland_leisure', 'data/wlz_inland.geojson')]:
        raw = (root / name).read_bytes()
        fc = json.loads(raw)
        sources[name] = {'sha256': hashlib.sha256(raw).hexdigest(),
                         'count': len(fc['features']), 'metadata': fc.get('metadata', {})}
        records.extend(audit_feature(f, dataset, checked_at.date()) for f in fc['features'])
    counts = Counter(issue.split(':')[0] for row in records for issue in row['issues'])
    result = {'schemaVersion': 1, 'checkedAt': checked_at.isoformat(timespec='seconds'),
              'scope': {'marine': False, 'krcReservoirRecommendations': False},
              'noticeBoundaryVerification': 'pending_individual_official_notice_review',
              'sources': sources, 'issueCounts': dict(sorted(counts.items())), 'records': records}
    directory = root / 'data/regulation-audit'
    directory.mkdir(parents=True, exist_ok=True)
    previous_path = directory / 'latest.json'
    if previous_path.exists():
        previous = json.loads(previous_path.read_text())
        old = {(r['dataset'], r['id']): r for r in previous['records']}
        new = {(r['dataset'], r['id']): r for r in records}
        result['changes'] = {
            'added': [list(k) for k in sorted(new.keys() - old.keys())],
            'removedNeedsNoticeReview': [list(k) for k in sorted(old.keys() - new.keys())],
            'geometryChanged': [list(k) for k in sorted(old.keys() & new.keys())
                                if old[k]['geometrySha256'] != new[k]['geometrySha256']],
        }
    (directory / 'latest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    labels = {'missing_notice_document': '개별 고시 원문 링크 누락',
              'notice_boundary_not_verified': '고시도면 경계 대조 미완료',
              'invalid_geometry': '도형 오류', 'approximate_boundary': '개략 경계',
              'stated_period_ended_recheck_notice': '기재 기간 종료: 변경·연장 고시 확인 필요'}
    lines = ['# 내수면 규제 경계 점검', '', f'확인 시각: {result["checkedAt"]}', '',
             '이 보고서는 자료·도형 점검 결과이며 개별 고시도면 대조 완료를 의미하지 않습니다.',
             '바다와 농어촌공사 관리 저수지 추천은 범위에서 제외합니다. 기존 규제 경계는 삭제하지 않습니다.', '',
             '| 점검 항목 | 건수 |', '|---|---:|']
    lines += [f'| {labels.get(key, key)} | {value} |' for key, value in sorted(counts.items())]
    lines += ['', '## 우선 검토', '', '| 구역 | 문제 |', '|---|---|']
    for row in records:
        urgent = [i for i in row['issues'] if i.startswith('invalid_geometry') or i.startswith('stated_period_ended')]
        if urgent:
            lines.append(f'| {row["name"]} ({row["id"]}) | {"; ".join(urgent)} |')
    lines += ['', '전체 구역별 근거·도형 해시·검토 상태: [latest.json](latest.json)', '']
    (directory / 'README.md').write_text('\n'.join(lines))
    print(json.dumps({'sources': {k: v['count'] for k, v in sources.items()}, 'issues': result['issueCounts']}, ensure_ascii=False))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    run(parser.parse_args().root)
