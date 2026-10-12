import assert from 'node:assert/strict';
import { handleDiaryApi } from '../workers/diary-api.mjs';

class MemoryKV {
  constructor() { this.values = new Map(); this.metadata = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value, options = {}) { this.values.set(key, value); this.metadata.set(key, options.metadata); }
  async delete(key) { this.values.delete(key); this.metadata.delete(key); }
  async list({ prefix }) {
    return { keys: [...this.values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name, metadata: this.metadata.get(name) })), list_complete: true };
  }
}

const env = { PLACES: new MemoryKV() };
const memberOk = async (_env, uid, token) => uid === 'member1' && token === 'secret';
const call = async (path, method = 'GET', body = null, uid = 'member1', token = 'secret') => {
  const req = new Request(`https://api.example.test${path}`, {
    method, headers: { 'Origin': 'https://canoe.crowdbase.kr', 'X-User-Id': uid, 'X-Auth-Token': token, 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const response = await handleDiaryApi(req, env, new URL(req.url), memberOk);
  return { status: response.status, body: await response.json() };
};

assert.equal((await call('/diaries', 'GET', null, 'member2')).status, 401);

const manual = await call('/diary', 'POST', {
  source: 'manual', date: '2026-10-12', title: '소양호 한 바퀴',
  launch: '선착장', landing: '랜딩지', notes: '잔잔한 물', companions: ['친구'],
  userDistanceKm: null,
});
assert.equal(manual.status, 201);
assert.equal(manual.body.visibility, 'private');
assert.equal(manual.body.distanceKm, null);
const listed = await call('/diaries');
assert.equal(listed.body.items.length, 1);
assert.equal(listed.body.items[0].title, '소양호 한 바퀴');
assert.equal((await call(`/diary?id=${manual.body.id}`, 'GET', null, 'member2')).status, 401);

const edited = await call('/diary', 'POST', {
  source: 'manual', diaryId: manual.body.id, rev: manual.body.rev,
  date: '2026-10-12', title: '소양호 한 바퀴', notes: '메모 수정', userDistanceKm: 4.2,
});
assert.equal(edited.status, 200);
assert.equal(edited.body.rev, 2);
assert.equal(edited.body.distanceKm, 4.2);
assert.equal((await call('/diary', 'POST', { source: 'manual', diaryId: manual.body.id, rev: 1, date: '2026-10-12' })).status, 409);

const gpx = await call('/diary', 'POST', {
  source: 'gpx', date: '2026-10-11', title: 'GPX 기록',
  lines: [[[37.9, 127.8, 1000], [37.901, 127.801, 61000]], [[37.902, 127.802, null], [37.903, 127.803, null]]],
});
assert.equal(gpx.status, 201);
assert.equal(gpx.body.lines.length, 2);
assert.equal(gpx.body.startTime, null);
assert.ok(gpx.body.distanceKm > 0);
assert.equal((await call('/diary', 'POST', { source: 'gpx', date: '2026-10-11', lines: [[[91, 127, null], [37, 127, null]]] })).status, 400);

await env.PLACES.put('trip:member1_trip', JSON.stringify({ uid: 'member1', title: '기존 투어', start: Date.parse('2026-10-10T01:00:00Z'), track: [[37.9, 127.8, 1000], [37.901, 127.801, 61000]], distKm: 1.1 }));
const tour = await call('/diary', 'POST', { source: 'tour', tripId: 'member1_trip', date: '2026-10-10', title: '기존 투어' });
assert.equal(tour.status, 201);
assert.equal(tour.body.tripId, 'member1_trip');
const duplicate = await call('/diary', 'POST', { source: 'tour', tripId: 'member1_trip', date: '2026-10-10', title: '중복 생성 시도' });
assert.equal(duplicate.body.duplicate, true);
assert.equal(duplicate.body.id, tour.body.id);

const archive = (record, tripSnapshot = null) => ({
  format: 'canoemap-diary-backup', version: 1, exportedAt: '2026-10-13T00:00:00Z',
  record: { ...record, visibility: 'public' }, tripSnapshot,
});
const manualImport = await call('/diary-import', 'POST', archive(manual.body));
assert.equal(manualImport.status, 201);
assert.match(manualImport.body.id, /^a_[0-9a-f]{32}$/);
assert.equal(manualImport.body.visibility, 'private');
assert.equal(manualImport.body.notes, '잔잔한 물');
const manualAgain = await call('/diary-import', 'POST', archive(manual.body));
assert.equal(manualAgain.status, 200);
assert.equal(manualAgain.body.duplicate, true);
assert.equal(manualAgain.body.id, manualImport.body.id);
const reexportedImport = await call('/diary-import', 'POST', archive(manualImport.body));
assert.equal(reexportedImport.body.duplicate, true);
assert.equal(reexportedImport.body.id, manualImport.body.id);
assert.equal((await call('/diary-import', 'POST', archive(manual.body), 'member2')).status, 401);
assert.equal((await call('/diary-import', 'POST', { ...archive(manual.body), version: 2 })).status, 400);

const gpxImport = await call('/diary-import', 'POST', archive(gpx.body));
assert.equal(gpxImport.status, 201);
assert.equal(gpxImport.body.lines.length, 2);
assert.equal(gpxImport.body.distanceKm, gpx.body.distanceKm);
const tourSnapshot = { id: 'member1_trip', track: [[37.9, 127.8, 1000], [37.901, 127.801, 61000], [37.91, 127.81, 120000], [37.911, 127.811, 180000]], breaks: [2] };
const tourImport = await call('/diary-import', 'POST', archive(tour.body, tourSnapshot));
assert.equal(tourImport.status, 201);
assert.equal(tourImport.body.source, 'gpx');
assert.equal(tourImport.body.archiveSource, 'tour');
assert.equal(tourImport.body.lines.length, 2);
assert.equal((await call('/diary-import', 'POST', archive(tour.body, { ...tourSnapshot, id: 'wrong' }))).status, 400);

assert.equal((await call(`/diary?id=${manual.body.id}`, 'DELETE')).status, 200);
assert.equal((await call(`/diary?id=${manual.body.id}`)).status, 404);
assert.equal((await call('/diaries')).body.items.length, 5);
console.log('Private diary API: ok');
