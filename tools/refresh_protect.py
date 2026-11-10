#!/usr/bin/env python3
"""Refresh verified VWorld water-protection polygons and deployed cache keys."""

import hashlib
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from vworld_protect import KOR_BBOX, extract_features, fetch_page, is_protection
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
MAPS = ('index.html', 'map.html', 'test.html', 'tour/legacy.html')
OUTPUT = 'protect_polygons.geojson'


def validate_geometry(geometry):
    kind = geometry.get('type')
    coordinates = geometry.get('coordinates')
    if kind not in ('Polygon', 'MultiPolygon') or not coordinates:
        raise ValueError('Invalid protection geometry')
    polygons = [coordinates] if kind == 'Polygon' else coordinates
    for polygon in polygons:
        if not polygon:
            raise ValueError('Empty protection polygon')
        for ring in polygon:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError('Protection ring must be closed')
            for point in ring:
                if len(point) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in point):
                    raise ValueError('Invalid protection coordinate')
                if not (124 <= point[0] <= 132 and 32.5 <= point[1] <= 39.5):
                    raise ValueError('Protection coordinate outside supported area')
            if len(set(map(tuple, ring[:-1]))) < 3:
                raise ValueError('Collapsed protection polygon')



def display_geometry(geometry):
    """Keep holes and disjoint parts; retain the source if simplification distorts it."""
    validate_geometry(geometry)
    original = shape(geometry)
    candidate = original.simplify(.00002, preserve_topology=True) if original.is_valid else original
    if original.area and abs(candidate.area / original.area - 1) > .01:
        candidate = original

    def rounded(coordinates):
        if isinstance(coordinates[0], (int, float)):
            return [round(n, 6) for n in coordinates]
        return [rounded(part) for part in coordinates]

    result = dict(mapping(candidate))
    result['coordinates'] = rounded(result['coordinates'])
    # Rounding very small rings can collapse them; use the original coordinates.
    if original.is_valid and not shape(result).is_valid:
        return dict(mapping(original))
    return result


def collect(fetch):
    records = {}
    expected = None
    page = 1
    while True:
        response = fetch(page)
        features, status, _ = extract_features(response)
        if status != 'OK':
            raise ValueError('VWorld collection failed: ' + str(status))
        record = response.get('response', response).get('record', {})
        total = int(record.get('total', -1))
        if total <= 0 or len(features) != int(record.get('current', -1)):
            raise ValueError('Invalid VWorld pagination counts')
        if expected is None:
            expected = total
        if total != expected or not features:
            raise ValueError('VWorld dataset changed or pagination is incomplete')
        for feature in features:
            properties = feature.get('properties') or {}
            identity = properties.get('mnum')
            if not identity or identity in records:
                raise ValueError('Missing or repeated VWorld record ID')
            if not properties.get('ucode'):
                raise ValueError('Missing VWorld regulation type')
            records[identity] = feature
        print(f'VWorld page {page}: {len(records)}/{expected}', flush=True)
        if len(records) >= expected:
            if len(records) != expected:
                raise ValueError('VWorld pagination overflow')
            break
        page += 1
        if page > 100:
            raise ValueError('VWorld pagination exceeded limit')

    selected = []
    for identity, feature in sorted(records.items()):
        properties = feature['properties']
        if not is_protection(properties):
            continue
        geometry = feature.get('geometry') or {}
        geometry = display_geometry(geometry)
        selected.append({
            'type': 'Feature',
            'geometry': geometry,
            'properties': {
                's': ' '.join(filter(None, [properties.get('sido_name'), properties.get('sigg_name')])),
                'mnum': identity,
                'ucode': properties['ucode'],
                'uname': properties.get('uname', ''),
                'dyear': properties.get('dyear', ''),
                'dnum': properties.get('dnum', ''),
            },
        })
    return {
        'type': 'FeatureCollection',
        'metadata': {
            'schemaVersion': 1,
            'source': 'VWorld LT_C_UM710',
            'sourceUrl': 'https://www.vworld.kr/',
            'typeCode': 'UMI100',
            'displayToleranceDegrees': .00002,
            'refreshedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'sourceCount': expected,
            'count': len(selected),
            'excludedOtherRegulations': expected - len(selected),
        },
        'features': selected,
    }


def validate_snapshot(snapshot, previous):
    features = snapshot['features']
    old = previous.get('features', [])
    # Legacy snapshots mixed regulation types and cannot supply a count baseline.
    previous_is_typed = previous.get('metadata', {}).get('typeCode') == 'UMI100'
    minimum = max(100, len(old) * .85) if previous_is_typed else 100
    if len(features) < minimum:
        raise ValueError(f'Incomplete protection snapshot: {len(features)} below {minimum}')
    if previous_is_typed:
        old_regions = {f['properties']['s'].split()[0] for f in old}
        regions = {f['properties']['s'].split()[0] for f in features}
        if not old_regions <= regions:
            raise ValueError('Protection snapshot lost a province')


def write_snapshot(snapshot, root=ROOT):
    target = root / OUTPUT
    validate_snapshot(snapshot, json.loads(target.read_text()))
    payload = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')).encode()
    digest = hashlib.sha1(payload).hexdigest()[:8]
    updates = {target: payload}
    for filename in MAPS:
        path = root / filename
        content, count = re.subn(r'(\bprotect:\s*")[a-f0-9]+(")', lambda m: m[1] + digest + m[2], path.read_text())
        if count != 1:
            raise ValueError('Expected one protection cache key in ' + filename)
        updates[path] = content.encode()
    # All API, geometry, completeness and cache-key checks precede writes.
    for path, contents in updates.items():
        temporary = path.with_name(path.name + '.refresh-tmp')
        temporary.write_bytes(contents)
        temporary.replace(path)
    print(f'Published snapshot: {len(snapshot["features"])} protection zones; {snapshot["metadata"]["excludedOtherRegulations"]} other regulations excluded', flush=True)


def main():
    key_path = ROOT / 'vworld_key.txt'
    key = os.environ.get('VWORLD_KEY') or (key_path.read_text().strip() if key_path.exists() else '')
    if not key:
        raise SystemExit('VWORLD_KEY is required')
    domain = os.environ.get('VWORLD_DOMAIN', 'https://canoe.crowdbase.kr')

    def fetch(page):
        for attempt in range(3):
            try:
                return fetch_page(key, domain, KOR_BBOX, page)
            except Exception:
                # Request exceptions can contain the API key in their URL.
                if attempt == 2:
                    raise RuntimeError('VWorld request failed after three attempts') from None
                time.sleep(2 ** attempt)

    write_snapshot(collect(fetch))


if __name__ == '__main__':
    main()
