#!/usr/bin/env python3
"""Import a reproducible NZ Gazetteer label snapshot (not water boundaries).
Usage: python3 tools/nz/import_place_names.py /path/to/gaz.csv
Official download: https://gazetteer.linz.govt.nz/gaz.csv
"""
import csv, hashlib, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=Path(sys.argv[1]); rows=list(csv.DictReader(source.open(encoding='utf-8-sig')))
items=[];seen=set()
for r in rows:
    # Exclude replaced/discontinued/collected and historical original-name entries.
    if not (r['status'].startswith('Official ') or r['status']=='Unofficial Recorded'):continue
    try:lat,lng=float(r['crd_latitude']),float(r['crd_longitude'])
    except ValueError:continue
    if not (-48<=lat<=-34 and 166<=lng<=179):continue
    kind=r['feat_type'];name=r['name']
    if kind in ('Town','City'):category,zoom='city',8
    elif kind=='Locality':category,zoom='city',11
    elif kind=='Suburb':category,zoom='city',12
    elif kind=='Lake':category,zoom='water',10
    elif kind=='Stream' and ('river' in name.lower() or 'awa' in name.lower()):category,zoom='water',11
    elif kind=='Range':category,zoom='mountain',11
    elif kind=='Hill':category,zoom='mountain',13
    else:continue
    key=(r['feat_id'],name)
    if key in seen:continue
    seen.add(key)
    items.append(dict(id=r['name_id'],original=name,lat=lat,lng=lng,kind=category,minZoom=zoom,featureType=kind,status=r['status']))
items.sort(key=lambda p:(p['minZoom'],p['id']))
d=dict(checkedAt='2026-11-28',source='https://gazetteer.linz.govt.nz/gaz.csv',license='LINZ / NZGB CC BY 4.0',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceRecords=len(rows),note='Label reference points, not river/lake geometries. Includes Official and Unofficial Recorded names; not all names are official.',items=items)
p=ROOT/'review/shared/new-zealand-gazetteer.json';p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n')
print(len(items),'labels;',p.stat().st_size,'bytes')
