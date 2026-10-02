import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'tour-test-secret';
const uid = 'tour-test-user';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const exp = Math.floor(Date.now() / 1000) + 3600;
const tok = `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
const data = new Map();
data.set(`member:${hmac(`member-key|${uid}`).slice(0, 32)}`, JSON.stringify({ status: 'active', nick: '테스트', memberId: 'test' }));
const env = {
  ADMIN_KEY: secret,
  SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
  },
};
const ctx = { waitUntil() {} };
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev';
const post = async (body) => worker.fetch(new Request(endpoint + '/trip', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: uid, tok, ...body }),
}), env, ctx);

const t = Date.now() - 10000;
const measured = [[37.89, 127.74, t], [37.8901, 127.7401, t + 3000]];
const estimate = [[37.89, 127.74], [37.90, 127.75]];
const response = await post({ action: 'save', clientId: 'tour-beta-test', title: '실측과 추정 분리', start: t, end: t + 3000, durSec: 3, track: measured, gpsTrack: measured, estimatedTrack: estimate, estimated: true, shared: false });
assert.equal(response.status, 200);
const saved = await response.json();
assert.ok(saved.distKm > 0 && saved.distKm < 0.1);
const trip = JSON.parse(data.get(`trip:${saved.id}`));
assert.equal(trip.recordVersion, 2);
assert.deepEqual(trip.track, measured);
assert.deepEqual(trip.estimatedTrack, estimate);
assert.ok(trip.estimatedKm > 1);
assert.equal(JSON.parse(data.get('board_measured_v2'))[uid].totalKm, saved.distKm);
assert.equal(data.has('board'), false);

const duplicate = await post({ action: 'save', clientId: 'tour-beta-test', track: measured });
assert.equal((await duplicate.json()).duplicate, true);
assert.equal(JSON.parse(data.get('utrips:' + uid)).length, 1);

const invalid = await post({ action: 'save', clientId: 'invalid', track: [[999, 127.74, t], measured[1]] });
assert.equal(invalid.status, 400);
assert.equal(JSON.parse(data.get('utrips:' + uid)).length, 1);

const legacy = await post({ action: 'save', clientId: 'legacy-queue', track: estimate.map((p, i) => [...p, t + i * 3000]), gpsTrack: measured, estimated: true });
assert.equal(legacy.status, 200);
const legacyTrip = JSON.parse(data.get(`trip:${(await legacy.json()).id}`));
assert.deepEqual(legacyTrip.track, measured);
assert.deepEqual(legacyTrip.estimatedTrack, estimate);
const pauseIntervals = [{ start: t + 500, end: t + 1500, type: 'manual' }];
const paused = await post({ action: 'save', clientId: 'paused-tour', title: '휴식 기록', start: t, end: t + 3000, durSec: 2, pauses: pauseIntervals, track: measured, shared: true });
assert.equal(paused.status, 200);
const pausedId = (await paused.json()).id;
assert.deepEqual(JSON.parse(data.get(`trip:${pausedId}`)).pauses, pauseIntervals);
assert.equal(JSON.parse(data.get(`trip:${pausedId}`)).restSec, 1);
assert.equal(JSON.parse(data.get('utrips:' + uid))[0].restSec, 1);
const feed = await worker.fetch(new Request(endpoint + '/feed'), env, ctx);
assert.equal((await feed.json())[0].restSec, 1);
const pausedDetail = await worker.fetch(new Request(endpoint + `/trip?id=${encodeURIComponent(pausedId)}&viewer=${encodeURIComponent(uid)}&tok=${encodeURIComponent(tok)}`), env, ctx);
assert.equal(pausedDetail.status, 200);
assert.deepEqual((await pausedDetail.json()).pauses, pauseIntervals);
const badPause = await post({ action: 'save', clientId: 'bad-pause', start: t, end: t + 3000, pauses: [{ start: t - 1000, end: t + 500, type: 'manual' }], track: measured });
assert.equal(badPause.status, 400);
console.log('tour worker measured/estimated regression: ok');
