import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'suggestion-test-secret', uid = 'suggestion-test-member';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const exp = Math.floor(Date.now() / 1000) + 3600;
const tok = `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
const data = new Map();
data.set(`member:${hmac(`member-key|${uid}`).slice(0, 32)}`, JSON.stringify({ status: 'active', nick: '제안자', memberId: 'suggestion-member' }));
const KV = {
  get: async (key, format) => format === 'json' ? JSON.parse(data.get(key) || 'null') : data.get(key) ?? null,
  put: async (key, value) => { data.set(key, value); },
  list: async ({ prefix, limit, cursor }) => {
    const keys = [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    return { keys: keys.slice(start, start + limit).map((name) => ({ name })), list_complete: start + limit >= keys.length, cursor: String(start + limit) };
  },
};
const env = { ADMIN_KEY: secret, SITE_URL: 'https://canoe.crowdbase.kr/', PLACES: KV };
const ctx = { waitUntil() {} };
const request = async (body) => worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/suggest', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, ctx);

assert.equal((await request({ kind: 'launch', name: '테스트', lat: 37, lng: 127 })).status, 401);
assert.equal((await request({ action: 'list' })).status, 403);
const submitted = await request({ id: uid, tok, kind: 'landing', name: '강변 랜딩지', addr: '강원도 춘천시', text: '차량 진입 가능', lat: 37.88, lng: 127.71 });
assert.equal(submitted.status, 200);
const created = await submitted.json();
assert.match(created.id, /^s[0-9]{13}[a-f0-9]{8}$/);
assert.equal(JSON.parse(data.get('place_suggestion:' + created.id)).status, 'pending');
assert.equal(data.has('placeover'), false);
const list = await (await request({ action: 'list', adminKey: secret })).json();
assert.equal(list.items.length, 1);
assert.equal(list.items[0].nick, '제안자');
const approved = await request({ action: 'approve', adminKey: secret, suggestionId: created.id, name: '확인된 랜딩지', kind: 'landing', lat: 37.881, lng: 127.711, note: '진입로 확인' });
assert.equal(approved.status, 200);
const result = await approved.json();
assert.equal(result.item.status, 'approved');
assert.equal(result.published.id, 'u' + created.id);
assert.equal(JSON.parse(data.get('placeover'))['u' + created.id].name, '확인된 랜딩지');
assert.equal(JSON.parse(data.get('placeover'))['u' + created.id].lat, 37.881);
const publicPlaces = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/launch-sites?bbox=127.6,37.8,127.8,38', {
  headers: { Origin: 'https://canoe.crowdbase.kr', 'X-User-Id': uid, 'X-Auth-Token': tok },
}), env, ctx);
assert.equal(publicPlaces.status, 200);
assert.equal((await publicPlaces.json()).items.some((place) => place.id === 'u' + created.id), true);
assert.equal((await request({ action: 'approve', adminKey: secret, suggestionId: created.id })).status, 409);

const obstacleSubmit = await request({ id: uid, tok, kind: 'landmark', type: '여울', name: '작은 여울', lat: 37.9, lng: 127.7, text: '우안 주의' });
const obstacleId = (await obstacleSubmit.json()).id;
const obstacleApproved = await request({ action: 'approve', adminKey: secret, suggestionId: obstacleId, type: '여울' });
assert.equal(obstacleApproved.status, 200);
assert.equal(JSON.parse(data.get('obstacles'))[0].id, 'suggestion:' + obstacleId);

const rejectedSubmit = await request({ id: uid, tok, kind: 'launch', name: '중복 장소', lat: 37.9, lng: 127.8 });
const rejectedId = (await rejectedSubmit.json()).id;
const rejected = await request({ action: 'reject', adminKey: secret, suggestionId: rejectedId, reviewNote: '기존 장소와 중복' });
assert.equal(rejected.status, 200);
assert.equal((await rejected.json()).item.status, 'rejected');
assert.equal(Object.keys(JSON.parse(data.get('placeover'))).length, 1);
assert.equal((await request({ action: 'approve', suggestionId: rejectedId })).status, 403);
const legacy = await request({ id: uid, tok, cat: '런칭/랜딩', addr: '구형 화면 제안', lat: 37.9, lng: 127.8 });
assert.equal(legacy.status, 200);
assert.equal(JSON.parse(data.get('place_suggestion:' + (await legacy.json()).id)).kind, 'launch');
console.log('place suggestions worker regression: ok');
