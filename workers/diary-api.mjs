import { prepareDiaryBackup } from './diary-import.mjs';

const PREFIX = 'diary-v1:';
const MAX_POINTS = 20000;
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

function json(value, status, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    },
  });
}

function key(uid, id) { return `${PREFIX}${uid}:${id}`; }
function cleanText(value, limit) { return String(value || '').trim().slice(0, limit); }
function validDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}
function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function normalizeLines(input) {
  if (!Array.isArray(input) || input.length > 100) return null;
  const lines = [];
  let count = 0, distance = 0, firstTime = null, lastTime = null, timed = true;
  for (const part of input) {
    if (!Array.isArray(part)) return null;
    const line = [];
    for (const point of part) {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lat = Number(point[0]), lon = Number(point[1]);
      const time = point[2] == null ? null : Number(point[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
        || (time !== null && (!Number.isFinite(time) || time < 0))) return null;
      count++;
      if (count > MAX_POINTS) return null;
      const normalized = [lat, lon, time];
      if (line.length) {
        const previous = line[line.length - 1];
        if (time !== null && previous[2] !== null && time < previous[2]) return null;
        distance += distanceMeters(previous, normalized);
      }
      if (time === null) timed = false;
      else { if (firstTime === null || time < firstTime) firstTime = time; if (lastTime === null || time > lastTime) lastTime = time; }
      line.push(normalized);
    }
    if (line.length) lines.push(line);
  }
  if (count < 2) return null;
  return { lines, pointCount: count, distanceKm: Math.round(distance / 10) / 100,
    startTime: timed ? firstTime : null, endTime: timed ? lastTime : null };
}
function summary(record) {
  return {
    id: record.id, source: record.source, title: record.title, date: record.date,
    distanceKm: record.distanceKm, courseName: record.courseName,
    updatedAt: record.updatedAt, visibility: 'private', archiveSource: record.archiveSource || null,
  };
}

export async function handleDiaryApi(req, env, url, memberOk) {
  const origin = req.headers.get('Origin') || '*';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const uid = cleanText(req.headers.get('X-User-Id'), 40);
  const token = req.headers.get('X-Auth-Token');
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid) || !(await memberOk(env, uid, token))) return json({ error: 'relogin' }, 401, origin);
  const kv = env.PLACES;
  if (!kv) return json({ error: 'no-store' }, 503, origin);

  if (url.pathname.endsWith('/diaries')) {
    if (req.method !== 'GET') return json({ error: 'method' }, 405, origin);
    const listed = await kv.list({ prefix: `${PREFIX}${uid}:`, limit: 50, cursor: url.searchParams.get('cursor') || undefined });
    const items = listed.keys.map((item) => item.metadata).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
    return json({ items, cursor: listed.list_complete ? null : listed.cursor }, 200, origin);
  }

  const requestedId = cleanText(url.searchParams.get('id'), 100);
  if (req.method === 'GET' || req.method === 'DELETE') {
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(requestedId)) return json({ error: 'bad-id' }, 400, origin);
    const raw = await kv.get(key(uid, requestedId));
    if (!raw) return json({ error: 'not-found' }, 404, origin);
    if (req.method === 'GET') return json(JSON.parse(raw), 200, origin);
    await kv.delete(key(uid, requestedId));
    return json({ ok: true }, 200, origin);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);
  const importing = url.pathname.endsWith('/diary-import');
  const maxBytes = importing ? MAX_IMPORT_BYTES : MAX_RECORD_BYTES;
  if (Number(req.headers.get('Content-Length')) > maxBytes) return json({ error: 'too-large' }, 413, origin);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > maxBytes) return json({ error: 'too-large' }, 413, origin);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'bad-json' }, 400, origin); }
  let archiveId = '', archiveSource = '';
  if (importing) {
    const prepared = await prepareDiaryBackup(body, uid);
    if (!prepared) return json({ error: 'bad-archive' }, 400, origin);
    archiveId = prepared.id;
    archiveSource = prepared.archiveSource;
    body = prepared.body;
    const existing = await kv.get(key(uid, archiveId));
    if (existing) return json({ ...JSON.parse(existing), duplicate: true }, 200, origin);
  }
  const source = cleanText(body.source, 10);
  if (!['tour', 'gpx', 'manual'].includes(source)) return json({ error: 'bad-source' }, 400, origin);

  let id = importing ? '' : cleanText(body.diaryId, 100), old = null;
  if (id) {
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(id)) return json({ error: 'bad-id' }, 400, origin);
    const found = await kv.get(key(uid, id));
    if (!found) return json({ error: 'not-found' }, 404, origin);
    old = JSON.parse(found);
    if (old.source !== source || Number(body.rev) !== old.rev) return json({ error: 'conflict' }, 409, origin);
  }

  id = id || archiveId;
  let tripId = '', track = null, trip = null;
  if (source === 'tour') {
    tripId = cleanText(body.tripId || old?.tripId, 100);
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(tripId)) return json({ error: 'bad-trip' }, 400, origin);
    const sourceRaw = await kv.get(`trip:${tripId}`);
    if (!sourceRaw) return json({ error: 'trip-not-found' }, 404, origin);
    trip = JSON.parse(sourceRaw);
    if (String(trip.uid) !== uid) return json({ error: 'forbidden' }, 403, origin);
    id = id || `t_${tripId}`;
    const existing = await kv.get(key(uid, id));
    if (existing && !old) return json({ ...JSON.parse(existing), duplicate: true }, 200, origin);
  } else if (source === 'gpx') {
    track = old && body.lines == null ? {
      lines: old.lines, pointCount: old.pointCount, distanceKm: old.distanceKm,
      startTime: old.startTime, endTime: old.endTime,
    } : normalizeLines(body.lines);
    if (!track) return json({ error: 'bad-track' }, 400, origin);
  }
  if (!id) id = `${source === 'gpx' ? 'g' : 'm'}_${crypto.randomUUID().replaceAll('-', '')}`;
  const date = validDate(body.date || old?.date || (trip?.start ? new Date(trip.start).toISOString().slice(0, 10) : ''));
  if (!date) return json({ error: 'bad-date' }, 400, origin);
  const companions = Array.isArray(body.companions) ? body.companions.slice(0, 20).map((x) => cleanText(x, 40)).filter(Boolean) : old?.companions || [];
  const userDistance = body.userDistanceKm == null || body.userDistanceKm === '' ? null : Number(body.userDistanceKm);
  const now = Date.now();
  const record = {
    id, source, tripId, visibility: 'private', archiveSource: archiveSource || old?.archiveSource || null,
    archiveIdentity: archiveId || old?.archiveIdentity || null,
    title: cleanText(body.title || old?.title || trip?.title || '카누잉 기록', 80), date,
    courseName: cleanText(body.courseName || old?.courseName || trip?.courseName, 80),
    launch: cleanText(body.launch || old?.launch || trip?.launch?.addr, 120),
    landing: cleanText(body.landing || old?.landing || trip?.landing?.addr, 120),
    notes: cleanText(body.notes ?? old?.notes, 5000), companions,
    lines: source === 'gpx' ? track.lines : [],
    pointCount: source === 'gpx' ? track.pointCount : source === 'tour' ? trip.track?.length || 0 : 0,
    distanceKm: source === 'gpx' ? track.distanceKm : source === 'tour' ? Number(trip.distKm) || 0 : Number.isFinite(userDistance) && userDistance >= 0 && userDistance <= 1000 ? userDistance : null,
    startTime: source === 'gpx' ? track.startTime : source === 'tour' ? Number(trip.start) || null : null,
    endTime: source === 'gpx' ? track.endTime : source === 'tour' ? Number(trip.end) || null : null,
    restSeconds: source === 'tour' ? Number(trip.restSec) || 0 : null,
    createdAt: old?.createdAt || now, updatedAt: now, rev: (old?.rev || 0) + 1,
  };
  await kv.put(key(uid, id), JSON.stringify(record), { metadata: summary(record) });
  return json(record, old ? 200 : 201, origin);
}
