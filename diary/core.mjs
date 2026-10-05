export const MAX_GPX_BYTES = 5 * 1024 * 1024;
export const MAX_GPX_POINTS = 20000;

export function haversineMeters(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

export function buildPreview(parts, { title = '카누잉 기록', source = 'gpx', kind = 'track', pauses = [], estimated = false } = {}) {
  if (!Array.isArray(parts)) throw new Error('경로 형식이 올바르지 않습니다.');
  const lines = [];
  const warnings = [];
  let distanceMeters = 0;
  let pointCount = 0;
  let firstTime = null;
  let lastTime = null;
  let timedCount = 0;
  for (const part of parts) {
    if (!Array.isArray(part)) throw new Error('경로 구간 형식이 올바르지 않습니다.');
    let line = [];
    for (const point of part) {
      if (!validPoint(point)) throw new Error('GPX에 범위를 벗어난 좌표가 있습니다.');
      pointCount++;
      if (pointCount > MAX_GPX_POINTS) throw new Error('경로 점이 너무 많습니다.');
      const time = Number.isFinite(point.time) ? point.time : null;
      if (time !== null) {
        timedCount++;
        if (firstTime === null || time < firstTime) firstTime = time;
        if (lastTime === null || time > lastTime) lastTime = time;
      }
      const previous = line.at(-1);
      if (previous) {
        const meters = haversineMeters(previous, point);
        const elapsed = time !== null && previous.time !== null ? (time - previous.time) / 1000 : null;
        const jump = elapsed !== null && (elapsed < 0 || (elapsed > 0 && meters / elapsed > 15));
        if (jump) {
          warnings.push('비정상적인 위치·시각 변화가 있어 해당 구간을 끊어 표시했습니다.');
          if (line.length) lines.push(line);
          line = [];
        } else {
          distanceMeters += meters;
        }
      }
      line.push({ lat: point.lat, lon: point.lon, time });
    }
    if (line.length) lines.push(line);
  }
  if (pointCount < 2) throw new Error('경로 점이 2개 이상 필요합니다.');
  if (timedCount !== pointCount) warnings.push('시각이 없는 점이 있어 전체 이동시간을 확정할 수 없습니다.');
  if (lines.length > 1) warnings.push('끊긴 구간은 직선으로 이어 그리지 않았습니다.');
  if (estimated) warnings.push('원래 투어 기록에 GPS 누락 추정 구간이 있습니다. 지도에는 실측 점만 표시합니다.');
  const restSeconds = Array.isArray(pauses) ? pauses.reduce((sum, pause) => {
    const start = Number(pause?.start), end = Number(pause?.end);
    return sum + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 1000 : 0);
  }, 0) : 0;
  return {
    title, source, kind, lines, warnings: [...new Set(warnings)], pointCount,
    distanceKm: distanceMeters / 1000,
    startTime: timedCount === pointCount ? firstTime : null,
    endTime: timedCount === pointCount ? lastTime : null,
    elapsedSeconds: timedCount === pointCount && lastTime >= firstTime ? (lastTime - firstTime) / 1000 : null,
    restSeconds,
  };
}

function children(element, name) {
  return Array.from(element.children || []).filter((child) => child.localName === name);
}

function childText(element, name) {
  return children(element, name)[0]?.textContent?.trim() || '';
}

function pointFromXml(element) {
  const lat = Number(element.getAttribute('lat'));
  const lon = Number(element.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !element.hasAttribute('lat') || !element.hasAttribute('lon')) {
    throw new Error('GPX에 위도·경도가 없는 점이 있습니다.');
  }
  const rawTime = childText(element, 'time');
  const time = rawTime ? Date.parse(rawTime) : null;
  if (rawTime && !Number.isFinite(time)) throw new Error('GPX에 읽을 수 없는 시각이 있습니다.');
  return { lat, lon, time };
}

export function parseGpx(xml, parser = new DOMParser()) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('비어 있는 GPX 파일입니다.');
  if (new TextEncoder().encode(xml).length > MAX_GPX_BYTES) throw new Error('GPX 파일은 5MB 이하여야 합니다.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('외부 XML 선언이 포함된 파일은 열 수 없습니다.');
  const document = parser.parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement?.localName !== 'gpx') {
    throw new Error('올바른 GPX 파일이 아닙니다.');
  }
  const root = document.documentElement;
  const tracks = children(root, 'trk').map((track, index) => {
    const parts = children(track, 'trkseg').map((segment) => children(segment, 'trkpt').map(pointFromXml));
    return { label: childText(track, 'name') || `트랙 ${index + 1}`, kind: 'track', parts };
  }).filter((track) => track.parts.some((part) => part.length));
  const routes = children(root, 'rte').map((route, index) => ({
    label: childText(route, 'name') || `계획 경로 ${index + 1}`,
    kind: 'route',
    parts: [children(route, 'rtept').map(pointFromXml)],
  })).filter((route) => route.parts[0].length);
  const entries = tracks.concat(routes);
  if (!entries.length) throw new Error('GPX에 트랙이나 계획 경로가 없습니다.');
  if (entries.length > 30) throw new Error('한 파일에 경로가 너무 많습니다.');
  const count = entries.reduce((sum, entry) => sum + entry.parts.reduce((n, part) => n + part.length, 0), 0);
  if (count > MAX_GPX_POINTS) throw new Error('GPX 경로 점이 너무 많습니다.');
  return entries;
}

export function tripPreview(trip) {
  const track = Array.isArray(trip.track) ? trip.track : Array.isArray(trip.gpsTrack) ? trip.gpsTrack : [];
  const cuts = new Set((Array.isArray(trip.breaks) ? trip.breaks : []).map(Number));
  const parts = [];
  let part = [];
  track.forEach((point, index) => {
    if (cuts.has(index) && part.length) { parts.push(part); part = []; }
    if (!Array.isArray(point)) throw new Error('저장된 투어 경로 형식이 올바르지 않습니다.');
    part.push({ lat: Number(point[0]), lon: Number(point[1]), time: Number(point[2]) });
  });
  if (part.length) parts.push(part);
  const preview = buildPreview(parts, {
    title: String(trip.title || '카누잉 기록'), source: 'tour', kind: 'track',
    pauses: trip.pauses, estimated: !!trip.estimated,
  });
  const start = Number(trip.start), end = Number(trip.end);
  if (Number.isFinite(start) && start > 0) preview.startTime = start;
  if (Number.isFinite(end) && end > 0) preview.endTime = end;
  if (preview.startTime && preview.endTime) preview.elapsedSeconds = Math.max(0, (preview.endTime - preview.startTime) / 1000);
  preview.courseName = String(trip.courseName || '');
  preview.savedDistanceKm = Number(trip.distKm) || null;
  return preview;
}
