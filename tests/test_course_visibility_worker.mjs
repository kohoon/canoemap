import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'course-visibility-test-secret';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const uid = 'course-owner';
const exp = Math.floor(Date.now() / 1000) + 3600;
const tok = `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
const key = `member:${hmac(`member-key|${uid}`).slice(0, 32)}`;
const data = new Map([[key, JSON.stringify({ status: 'active', memberId: hmac(`member-id|${uid}`).slice(0, 16), nick: '패들러' })]]);
const env = {
  ADMIN_KEY: secret,
  SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => { data.set(k, v); },
    delete: async (k) => { data.delete(k); },
  },
};
const ctx = { waitUntil() {} };
const post = (token, origin, ids) => worker.fetch(new Request('https://mycanoe-map.kohoon0140.workers.dev/profile', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'course-visibility', id: uid, tok: token, courseHiddenIds: ids }),
}), env, ctx);

assert.equal((await post('wrong', 'https://canoe.crowdbase.kr', ['1790000000099'])).status, 401);
assert.equal((await post(tok, 'https://evil.example', ['1790000000099'])).status, 403);
const response = await post(tok, 'https://canoe.crowdbase.kr', ['1790000000099', '1790000000099', 'bad']);
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).profile.courseHiddenIds, ['1790000000099']);
assert.deepEqual(JSON.parse(data.get(key)).courseHiddenIds, ['1790000000099']);
console.log('course visibility profile regression: ok');
