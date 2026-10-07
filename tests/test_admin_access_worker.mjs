import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';
import { accessDay, accessDayWindow, appendMemberAccess, dailyMemberAccess } from '../workers/access-history.mjs';

const dayMs = 86400000;
const today = accessDay(Date.now());
const yesterday = accessDay(Date.now() - dayMs);
const now = Date.now();
assert.equal(accessDay(Date.parse('2026-10-06T15:00:00Z')), '2026-10-07');
assert.equal(accessDay(Date.parse('2026-10-06T14:59:59Z')), '2026-10-06');
assert.equal(accessDayWindow('2026-02-30'), null);
assert.equal(accessDayWindow(accessDay(now + dayMs)), null);

const member = { memberId: 'pseudonym-1', nick: '첫 회원', status: 'active', providerId: 'raw-secret' };
appendMemberAccess(member, now - dayMs, 'visit', 'mobile');
appendMemberAccess(member, now, 'login', 'pc');
assert.equal(dailyMemberAccess([member], accessDayWindow(today)).length, 1);
const pruning = { accessHistory: [{ at: now - 31 * dayMs, type: 'visit', device: 'pc' }] };
appendMemberAccess(pruning, now, 'visit', 'pc');
assert.equal(pruning.accessHistory.length, 1);

const secret = 'admin-access-test';
const uid = '123456789';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const memberKey = `member:${hmac(`member-key|${uid}`).slice(0, 32)}`;
const store = new Map([[memberKey, JSON.stringify(member)]]);
const env = {
  ADMIN_KEY: secret, SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (key) => store.get(key) || null,
    put: async (key, value) => { store.set(key, value); },
    list: async ({ prefix }) => ({ keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  },
};
const pending = [];
const ctx = { waitUntil(promise) { pending.push(promise); } };
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/admin-access';
const request = (body, origin = 'https://canoe.crowdbase.kr') => worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, ctx);

assert.equal((await request({ key: 'wrong', day: today })).status, 403);
assert.equal((await request({ key: secret, day: today }, 'https://other.example')).status, 403);
assert.equal((await request({ key: secret, day: '2026-02-30' })).status, 400);
assert.equal((await worker.fetch(new Request(endpoint), env, ctx)).status, 405);
const first = await request({ key: secret, day: today });
assert.equal(first.status, 200);
assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
const todayData = await first.json();
assert.equal(todayData.total, 1);
assert.equal(todayData.items[0].type, 'login');
assert.equal(JSON.stringify(todayData).includes('raw-secret'), false);
assert.equal((await (await request({ key: secret, day: yesterday })).json()).items[0].type, 'visit');

const exp = Math.floor(now / 1000) + 3600;
const tok = `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
const logResponse = await worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/log', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: uid, tok, type: 'paddling_visit', dev: '모바일' }),
}), env, ctx);
assert.equal(logResponse.status, 200);
await Promise.all(pending);
const after = await (await request({ key: secret, day: today, offset: 0, limit: 1 })).json();
assert.equal(after.total, 2);
assert.equal(after.items.length, 1);
assert.equal(after.items[0].type, 'paddling_visit');
assert.equal(after.nextOffset, 1);
const next = await (await request({ key: secret, day: today, offset: 1, limit: 1 })).json();
assert.equal(next.items[0].type, 'login');
assert.equal(next.nextOffset, null);

let activeGets = 0, peakGets = 0;
const manyEnv = { ...env, PLACES: {
  list: async () => ({ keys: Array.from({ length: 60 }, (_, i) => ({ name: `member:test-${i}` })), list_complete: true }),
  get: async (key) => {
    activeGets++;
    peakGets = Math.max(peakGets, activeGets);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeGets--;
    return JSON.stringify({ memberId: key, nick: '회원', accessHistory: [{ at: now, type: 'visit', device: 'pc' }] });
  },
} };
const many = await worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: secret, day: today }),
}), manyEnv, ctx);
assert.equal((await many.json()).total, 60);
assert.ok(peakGets > 1 && peakGets <= 6, `bounded parallel KV reads expected, got ${peakGets}`);
const failingEnv = { ...manyEnv, PLACES: { ...manyEnv.PLACES, get: async () => { throw new Error('KV unavailable'); } } };
const failed = await worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: secret, day: today }),
}), failingEnv, ctx);
assert.equal(failed.status, 503);
assert.equal((await failed.json()).error, 'member-read-failed');
console.log('admin daily access regression: ok');
