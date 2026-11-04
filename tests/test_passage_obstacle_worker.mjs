import assert from 'node:assert/strict';
import worker from '../workers/auth-worker.js';

const data = new Map();
const env = {
  ADMIN_KEY: 'test-admin-key',
  SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (key) => data.get(key) || null,
    put: async (key, value) => { data.set(key, value); },
  },
};
const ctx = { waitUntil() {} };
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/obstacle';
const post = (body) => worker.fetch(new Request(endpoint, {
  method: 'POST',
  headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}), env, ctx);

assert.equal((await post({ action: 'add', type: '통과지점', name: '수로 입구', lat: 38, lng: 127 })).status, 403);
assert.equal(data.has('obstacles'), false);
const saved = await post({ action: 'add', adminKey: env.ADMIN_KEY, type: '통과지점', name: '수로 입구', note: '우측으로 통과', lat: 38, lng: 127 });
assert.equal(saved.status, 200);
const item = (await saved.json()).obstacle;
assert.equal(item.type, '통과지점');
assert.equal(item.name, '수로 입구');
const publicResponse = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/obstacles'), env, ctx);
assert.equal(publicResponse.status, 200);
assert.deepEqual((await publicResponse.json()).map((obstacle) => obstacle.id), [item.id]);
assert.equal((await post({ action: 'edit', obsId: item.id, type: '통과지점', note: '변경' })).status, 403);
assert.equal(JSON.parse(data.get('obstacles'))[0].note, '우측으로 통과');

console.log('passage obstacle worker regression: ok');

// Private landmark types must never escape through the public API.
for (const type of ['캠핑사이트', '계곡']) {
  assert.equal((await post({ action: 'add', type, lat: 37, lng: 127 })).status, 403);
  const response = await post({ action: 'add', adminKey: env.ADMIN_KEY, type, name: type + ' 시험', lat: 37, lng: 127 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).obstacle.type, type);
}
const publicItems = await (await worker.fetch(new Request(endpoint + 's'), env, ctx)).json();
assert.equal(publicItems.some(x => ['캠핑사이트', '계곡'].includes(x.type)), false);
assert.equal(publicItems.some(x => x.type === '통과지점'), true);
assert.equal((await post({action:'list-admin',adminKey:'wrong'})).status,403);
const privateItems = await (await post({action:'list-admin',adminKey:env.ADMIN_KEY})).json();
assert.equal(privateItems.filter(x => ['캠핑사이트', '계곡'].includes(x.type)).length,2);
console.log('private campsite and valley access: ok');
