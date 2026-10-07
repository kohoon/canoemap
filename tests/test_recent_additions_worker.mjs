import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'recent-test-secret';
const uid = 'recent-test-user';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const exp = Math.floor(Date.now() / 1000) + 3600;
const tok = `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
const now = Date.now();
const data = new Map();
data.set(`member:${hmac(`member-key|${uid}`).slice(0, 32)}`, JSON.stringify({ status: 'active', nick: '테스트', memberId: 'recent-test' }));
data.set('courses', JSON.stringify([
  { id: now - 3000, t: now - 3000, owner: 'admin', name: '엑스페디션#10', km: 12, coords: [[37, 127], [37.1, 127.1]] },
  { id: now - 2000, t: now - 2000, owner: uid, name: '개인 비공개 코스', km: 5, coords: [[37, 127], [37.1, 127.1]] },
  { id: now - 1000, t: now - 1000, owner: 'admin', name: '엑스페디션#11', km: 25, coords: [[38, 127], [38.1, 127.1]] },
  { id: now - 100, t: now - 100, owner: 'admin', name: '번버리 픽 춘천호', km: 8, coords: [[38, 127], [38.1, 127.1]] },
]));
data.set('placeover', JSON.stringify({
  ['u' + (now - 500)]: { new: 1, name: '새 런칭지', cat: 'canoe', lat: 38, lng: 127 },
  ['u' + (now - 400)]: { new: 1, name: '비공개 후보지', cat: 'candidate', lat: 38, lng: 127 },
  ['u' + (now - 300)]: { new: 1, name: '삭제된 곳', cat: 'canoe', del: 1, lat: 38, lng: 127 },
  ['u' + (now - 200)]: { new: 1, name: '카누 명소', cat: 'spot', lat: 38, lng: 127 },
}));
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
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/recent-additions';
const request = (headers) => worker.fetch(new Request(endpoint, { headers: { Origin: 'https://canoe.crowdbase.kr', ...headers } }), env, ctx);

assert.equal((await request({})).status, 401);
assert.equal((await worker.fetch(new Request(endpoint, { headers: { Origin: 'https://elsewhere.example', 'X-User-Id': uid, 'X-Auth-Token': tok } }), env, ctx)).status, 403);
const response = await request({ 'X-User-Id': uid, 'X-Auth-Token': tok });
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
const recent = await response.json();
assert.deepEqual(recent.courses.map((course) => course.id), ['k' + (now - 100), 'k' + (now - 1000), 'k' + (now - 3000)]);
assert.equal(recent.courses[0].name, '번버리Pick 춘천호');
assert.deepEqual(recent.places.map((place) => place.name), ['새 런칭지']);
assert.equal(JSON.stringify(recent).includes('개인 비공개 코스'), false);
assert.equal(JSON.stringify(recent).includes('비공개 후보지'), false);

const seenIds = [...recent.courses.map((course) => 'course:' + course.id), ...recent.places.map((place) => 'place:' + place.id)];
const acknowledged = await worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json', 'X-User-Id': uid, 'X-Auth-Token': tok },
  body: JSON.stringify({ ids: seenIds }),
}), env, ctx);
assert.equal(acknowledged.status, 200);
assert.deepEqual(await (await request({ 'X-User-Id': uid, 'X-Auth-Token': tok })).json(), { courses: [], places: [] });
assert.equal(JSON.parse(data.get('recent_seen:' + hmac(`member-id|${uid}`).slice(0, 16))).length, seenIds.length);
const otherUid = 'another-recent-member';
data.set(`member:${hmac(`member-key|${otherUid}`).slice(0, 32)}`, JSON.stringify({ status: 'active', nick: '다른 회원' }));
const otherTok = `mc2.${exp}.${hmac(`mc2|${otherUid}|${exp}`).slice(0, 32)}`;
const otherResponse = await request({ 'X-User-Id': otherUid, 'X-Auth-Token': otherTok });
assert.equal((await otherResponse.json()).courses.length, recent.courses.length);

const forged = await worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json', 'X-User-Id': uid, 'X-Auth-Token': tok },
  body: JSON.stringify({ ids: ['place:some-made-up-id'] }),
}), env, ctx);
assert.equal(forged.status, 400);

const featuredUrl = 'https://mycanoe-map.kohoon0140.workers.dev/courses?featured=1&uid=' + encodeURIComponent(uid) + '&tok=' + encodeURIComponent(tok);
const featuredResponse = await worker.fetch(new Request(featuredUrl, { headers: { Origin: 'https://canoe.crowdbase.kr' } }), env, ctx);
assert.equal(featuredResponse.status, 200);
const featured = await featuredResponse.json();
assert.deepEqual(featured.map((course) => course.id).sort(), [now - 3000, now - 1000, now - 100].sort());
assert.equal(featured.some((course) => course.name === '번버리Pick 춘천호'), true);

for (const body of [
  { action: 'adduser', id: uid, tok, name: '번버리 픽 개인 코스', coords: [[37, 127], [37.1, 127.1]] },
  { action: 'edituser', id: uid, tok, courseId: now - 2000, name: '번버리 픽 개인 코스' },
  { action: 'adduser', id: uid, tok, name: '번버리Pick 개인 코스', coords: [[37, 127], [37.1, 127.1]] },
  { action: 'edituser', id: uid, tok, courseId: now - 2000, name: '번버리Pick 개인 코스' },
]) {
  const denied = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/course', {
    method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env, ctx);
  assert.equal(denied.status, 403);
}

globalThis.caches = { default: { delete: async () => true } };
const created = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/course', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'add', adminKey: secret, name: '번버리Pick 테스트', waterType: 'flowing', travelMode: 'downriver', coords: [[37, 127], [37.1, 127.1]] }),
}), env, ctx);
assert.equal(created.status, 200);
const saved = (await created.json()).course;
assert.equal(saved.waterType, 'flowing');
assert.equal(saved.travelMode, 'downriver');
assert.deepEqual((await (await request({ 'X-User-Id': uid, 'X-Auth-Token': tok })).json()).courses.map((course) => course.id), ['k' + saved.id]);

const staticUpdated = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/course', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'editstatic', adminKey: secret, cid: '1', name: '정적 코스', km: 2, waterType: 'flat', travelMode: 'traverse' }),
}), env, ctx);
assert.equal(staticUpdated.status, 200);
assert.equal(JSON.parse(data.get('course_over'))['1'].waterType, 'flat');
assert.equal(JSON.parse(data.get('course_over'))['1'].travelMode, 'traverse');

console.log('recent additions worker regression: ok');
