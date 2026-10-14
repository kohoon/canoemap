// 코스와 같은 하천 중심선 위의 관측소만 보수적으로 연결한다.
// 상·하류는 코스 출발→도착 방향을 기준으로 한 추정이며, 왕복 코스는 외부 구간을 분류하지 않는다.
function km(a, b) {
  const dy = (b[0] - a[0]) * 110.57;
  const dx = (b[1] - a[1]) * 111.32 * Math.cos((a[0] + b[0]) * Math.PI / 360);
  return Math.hypot(dx, dy);
}

function project(point, line) {
  let best = { distanceKm: Infinity, atKm: 0 }, along = 0;
  const sx = 111.32 * Math.cos(point[0] * Math.PI / 180);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const ax = (a[1] - point[1]) * sx, ay = (a[0] - point[0]) * 110.57;
    const dx = (b[1] - a[1]) * sx, dy = (b[0] - a[0]) * 110.57;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const distanceKm = Math.hypot(ax + dx * t, ay + dy * t);
    if (distanceKm < best.distanceKm) best = { distanceKm, atKm: along + km(a, b) * t };
    along += km(a, b);
  }
  return best;
}

function bounds(line) {
  return line.reduce((b, p) => ({ s: Math.min(b.s, p[0]), n: Math.max(b.n, p[0]),
    w: Math.min(b.w, p[1]), e: Math.max(b.e, p[1]) }), { s: 90, n: -90, w: 180, e: -180 });
}

export function rankCourseStations(course, stations, riverFeatures, options = {}) {
  const route = (course?.coords || []).filter(p => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]));
  if (route.length < 2) return [];
  const maxBeyondKm = options.maxBeyondKm ?? 12;
  const maxResults = options.maxResults ?? 8;
  const routeKm = [0];
  for (let i = 1; i < route.length; i++) routeKm.push(routeKm[i - 1] + km(route[i - 1], route[i]));
  const totalKm = routeKm.at(-1), box = bounds(route), pad = maxBeyondKm / 100;
  const step = Math.max(1, Math.ceil(route.length / 40));
  const sample = route.map((p, i) => ({ p, i })).filter(x => x.i % step === 0 || x.i === route.length - 1);
  const features = (riverFeatures || []).filter(f => f?.geometry?.type === 'LineString').map(f => {
    const line = f.geometry.coordinates.map(p => [+p[1], +p[0]]);
    return line.length > 1 ? { line, box: bounds(line), name: String(f.properties?.name || '') } : null;
  }).filter(f => f && f.box.n >= box.s - pad && f.box.s <= box.n + pad && f.box.e >= box.w - pad && f.box.w <= box.e + pad);
  const anchored = features.map(f => {
    const near = sample.map(x => ({ ...project(x.p, f.line), routeKm: routeKm[x.i] }))
      .filter(x => x.distanceKm <= 0.8);
    if (near.length < 2 || near.at(-1).routeKm - near[0].routeKm < 0.5) return null;
    const first = near[0], last = near.at(-1);
    if (Math.abs(last.atKm - first.atKm) < 0.5) return null;
    return { ...f, min: Math.min(...near.map(x => x.atKm)), max: Math.max(...near.map(x => x.atKm)),
      forward: last.atKm > first.atKm, firstKm: first.routeKm, lastKm: last.routeKm };
  }).filter(Boolean);
  if (!anchored.length) return [];

  const result = [];
  for (const station of stations || []) {
    const point = [+station.lat, +station.lng];
    if (!point.every(Number.isFinite)) continue;
    if (point[0] < box.s - pad || point[0] > box.n + pad || point[1] < box.w - pad || point[1] > box.e + pad) continue;
    const allNear = features.map(f => ({ feature: f, projection: project(point, f.line) }))
      .filter(x => x.projection.distanceKm <= 0.5);
    if (!allNear.length) continue;
    const nearestWaterway = Math.min(...allNear.map(x => x.projection.distanceKm));
    let best = null;
    for (const f of anchored) {
      const hit = allNear.find(x => x.feature.line === f.line);
      if (!hit || hit.projection.distanceKm > nearestWaterway + 0.1) continue;
      const along = hit.projection.atKm;
      const routeDistanceKm = project(point, route).distanceKm;
      let relation = '', distanceKm = 0;
      if (along >= f.min - 0.2 && along <= f.max + 0.2 && routeDistanceKm <= 0.8) {
        relation = '코스 내'; distanceKm = routeDistanceKm;
      } else if (course.travelMode !== 'roundtrip') {
        const before = f.forward ? along < f.min : along > f.max;
        const after = f.forward ? along > f.max : along < f.min;
        if (before && f.firstKm <= 2) { relation = '상류'; distanceKm = Math.abs(along - (f.forward ? f.min : f.max)); }
        if (after && totalKm - f.lastKm <= 2) { relation = '하류'; distanceKm = Math.abs(along - (f.forward ? f.max : f.min)); }
        if (distanceKm > maxBeyondKm) relation = '';
      }
      if (relation && (!best || distanceKm < best.distanceKm)) best = { station, relation, distanceKm, riverName: f.name };
    }
    if (best) result.push(best);
  }
  const order = { '코스 내': 0, '상류': 1, '하류': 2 };
  return result.sort((a, b) => order[a.relation] - order[b.relation] || a.distanceKm - b.distanceKm).slice(0, maxResults);
}
