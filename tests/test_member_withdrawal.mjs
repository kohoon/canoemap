import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'member-withdrawal-test-secret';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const token = (uid) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
};
const data = new Map();
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
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/profile';
const post = (uid, body) => worker.fetch(new Request(endpoint, {
  method: 'POST',
  headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: uid, tok: token(uid), ...body }),
}), env, ctx);
const get = (uid) => worker.fetch(new Request(`${endpoint}?uid=${encodeURIComponent(uid)}&tok=${encodeURIComponent(token(uid))}`), env, ctx);

const uid = 'withdrawn-user';
const memberKey = `member:${hmac(`member-key|${uid}`).slice(0, 32)}`;
data.set(memberKey, JSON.stringify({ status: 'active', nick: '탈퇴 전', memberId: 'test-member', joinedAt: Date.now(), lastDevice: 'pc' }));

const withdrawal = await post(uid, { action: 'withdraw' });
assert.equal(withdrawal.status, 200);
assert.equal((await withdrawal.json()).status, 'withdrawn');
assert.equal(JSON.parse(data.get(memberKey)).status, 'withdrawn');
assert.equal(JSON.parse(data.get(memberKey)).nick, '탈퇴회원');
assert.equal(JSON.parse(data.get(memberKey)).lastDevice, undefined);

const profile = await get(uid);
assert.equal(profile.status, 403);
assert.equal((await profile.json()).error, 'withdrawn-member');

const rejoin = await post(uid, { nick: '다시가입', termsAgreed: true, privacyAgreed: true });
assert.equal(rejoin.status, 403);
assert.equal((await rejoin.json()).error, 'withdrawn-member');
assert.equal(JSON.parse(data.get(memberKey)).status, 'withdrawn');

// An administrator may approve a specific withdrawn record without making it active.
// The member must still sign in and consent to the current terms to register again.
data.set(memberKey, JSON.stringify({ ...JSON.parse(data.get(memberKey)), status: 'rejoin_allowed', rejoinApprovedAt: Date.now() }));
const approvedProfile = await get(uid);
assert.equal(approvedProfile.status, 200);
assert.equal((await approvedProfile.json()).registrationRequired, true);
const approvedRegistration = await post(uid, { nick: '다시가입', termsAgreed: true, privacyAgreed: true });
assert.equal(approvedRegistration.status, 200);
assert.equal(JSON.parse(data.get(memberKey)).status, 'active');

console.log('member withdrawal/rejoin regression: ok');
