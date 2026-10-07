import assert from 'node:assert/strict';
import worker from '../workers/auth-worker.js';

const courses = [
  { id: 1810000000001, t: 1810000000001, owner: 'admin', nick: '운영자', name: '운영 코스', km: 10, coords: [[37, 127], [37.1, 127.1]] },
  { id: 1810000000002, t: 1810000000002, owner: 'kakao-ordinary-1', nick: '번버리', name: '첫째 회원 코스', km: 5, coords: [[38, 128], [38.1, 128.1]] },
  { id: 1810000000003, t: 1810000000003, owner: 'kakao-ordinary-2', nick: '다른 회원', name: '둘째 회원 코스', km: 7, coords: [[36, 126], [36.1, 126.1]] },
];
const env = { ADMIN_KEY: 'test-admin-secret', SITE_URL: 'https://canoe.crowdbase.kr/', PLACES: { get: async (key) => key === 'courses' ? JSON.stringify(courses) : null } };
const ctx = { waitUntil() {} };
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/admin-courses';
const request = (body, origin = 'https://canoe.crowdbase.kr') => worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, ctx);

assert.equal((await request({ key: 'wrong' })).status, 403);
assert.equal((await request({ key: env.ADMIN_KEY }, 'https://evil.example')).status, 403);
assert.equal((await worker.fetch(new Request(endpoint), env, ctx)).status, 405);

const response = await request({ key: env.ADMIN_KEY, scope: 'member', limit: 1 });
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
const first = await response.json();
assert.deepEqual(first.summary, { total: 3, admin: 1, member: 2, memberOwners: 2, unknown: 0 });
assert.equal(first.matched, 2);
assert.equal(first.items.length, 1);
assert.equal(first.nextOffset, 1);
assert.equal(first.items[0].name, '둘째 회원 코스');
assert.equal(first.owners.length, 2);
assert.equal(JSON.stringify(first).includes('kakao-ordinary'), false);
assert.equal(JSON.stringify(first).includes('coords'), false);
assert.equal(JSON.stringify(first).includes('37.1'), false);

const filtered = await (await request({ key: env.ADMIN_KEY, scope: 'member', q: '번버리', offset: 0 })).json();
assert.deepEqual(filtered.items.map((x) => x.name), ['첫째 회원 코스']);
const second = await (await request({ key: env.ADMIN_KEY, scope: 'member', offset: 1, limit: 1 })).json();
assert.equal(second.items[0].name, '첫째 회원 코스');
assert.equal(second.nextOffset, null);

globalThis.caches = { default: { delete: async () => true } };
const singleStore = new Map([['courses', JSON.stringify([
  { id: 1810000000021, owner: 'kakao-bunbury', nick: '번버리', name: '엑스페디션#12 · 소양호', coords: [[38, 128], [38.1, 128.1]] },
  { id: 1810000000022, owner: 'kakao-bunbury', nick: '번버리', name: '번버리의 다른 코스', coords: [[38, 128], [38.2, 128.2]] },
  { id: 1810000000023, owner: 'kakao-other', nick: '번버리', name: '엑스페디션#12 · 동명 회원', coords: [[37, 127], [37.1, 127.1]] },
])]]);
const singleEnv = { ...env, PLACES: { get: async (key) => singleStore.get(key) || null, put: async (key, value) => singleStore.set(key, value) } };
const singleInventory = await (await worker.fetch(new Request(endpoint, { method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: env.ADMIN_KEY }) }), singleEnv, ctx)).json();
const target = singleInventory.items.find((course) => course.id === '1810000000021');
const transferOne = (body) => worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/course', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'transfer-expedition12', adminKey: env.ADMIN_KEY, courseId: target.id, ownerId: target.ownerId, expectedName: target.name, ...body }),
}), singleEnv, ctx);
assert.equal((await transferOne({ adminKey: 'wrong' })).status, 403);
assert.equal((await transferOne({ ownerId: singleInventory.items.find((course) => course.id === '1810000000023').ownerId })).status, 409);
assert.equal((await transferOne({ expectedName: '엑스페디션#12 · 다른 이름' })).status, 409);
const singleResponse = await transferOne({});
assert.equal(singleResponse.status, 200);
assert.deepEqual(await singleResponse.json(), { ok: true, courseId: target.id, count: 1 });
const singleAfter = JSON.parse(singleStore.get('courses'));
assert.deepEqual(singleAfter.map((course) => course.owner), ['admin', 'kakao-bunbury', 'kakao-other']);
assert.deepEqual(singleAfter[0].coords, [[38, 128], [38.1, 128.1]]);
assert.equal([...singleStore.keys()].some((key) => key.startsWith('course_transfer:') && JSON.parse(singleStore.get(key)).courseId === target.id), true);

console.log('admin courses worker regression: ok');
