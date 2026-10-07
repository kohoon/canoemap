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

const transferStore = new Map([['courses', JSON.stringify([
  { id: 1810000000011, owner: 'kakao-bunbury', nick: '번버리', name: '이관 대상 A', coords: [[38, 128], [38.1, 128.1]] },
  { id: 1810000000012, owner: 'kakao-bunbury', nick: '번버리', name: '이관 대상 B', coords: [[38, 128], [38.2, 128.2]] },
  { id: 1810000000013, owner: 'kakao-other', nick: '번버리', name: '동명 회원 코스', coords: [[37, 127], [37.1, 127.1]] },
])]]);
const transferEnv = { ...env, PLACES: { get: async (key) => transferStore.get(key) || null, put: async (key, value) => transferStore.set(key, value) } };
globalThis.caches = { default: { delete: async () => true } };
const inventory = await (await worker.fetch(new Request(endpoint, { method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: env.ADMIN_KEY }) }), transferEnv, ctx)).json();
const bunbury = inventory.owners.find((owner) => owner.courseIds.includes('1810000000011'));
assert.equal(bunbury.count, 2);
assert.deepEqual(bunbury.courseIds, ['1810000000011', '1810000000012']);
const transfer = (body, origin = 'https://canoe.crowdbase.kr') => worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/course', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transfer-owner', adminKey: env.ADMIN_KEY, ownerId: bunbury.ownerId, courseIds: bunbury.courseIds, ...body }) }), transferEnv, ctx);
assert.equal((await transfer({ courseIds: ['1810000000011'] })).status, 409);
assert.equal((await transfer({ adminKey: 'wrong' })).status, 403);
assert.equal((await transfer({}, 'https://evil.example')).status, 403);
const transferResponse = await transfer({});
assert.equal(transferResponse.status, 200);
const transferResult = await transferResponse.json();
assert.equal(transferResult.count, 2);
const after = JSON.parse(transferStore.get('courses'));
assert.deepEqual(after.map((course) => course.owner), ['admin', 'admin', 'kakao-other']);
assert.deepEqual(after.map((course) => course.coords), [[[38, 128], [38.1, 128.1]], [[38, 128], [38.2, 128.2]], [[37, 127], [37.1, 127.1]]]);
assert.equal(JSON.parse(transferStore.get(transferResult.auditKey)).before.length, 2);

console.log('admin courses worker regression: ok');
