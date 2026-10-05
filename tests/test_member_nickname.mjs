import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';
import { NICK_CHANGE_INTERVAL_MS } from '../workers/member-security.mjs';

const secret = 'nickname-test-secret';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const token = (uid) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
};
const data = new Map();
const uid = 'nick-user', otherUid = 'other-user';
const memberId = hmac(`member-id|${uid}`).slice(0, 16);
const memberKey = `member:${hmac(`member-key|${uid}`).slice(0, 32)}`;
const env = {
  ADMIN_KEY: secret, SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
  },
};
const ctx = { waitUntil() {} };
const endpoint = 'https://mycanoe-map.kohoon0140.workers.dev/profile';
const post = (id, nick, origin = 'https://canoe.crowdbase.kr') => worker.fetch(new Request(endpoint, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'change-nick', id, tok: token(id), nick }),
}), env, ctx);
data.set(memberKey, JSON.stringify({ status: 'active', memberId, nick: '옛이름', joinedAt: Date.now() - 30 * 86400000 }));
data.set('member_nick:옛이름', memberId);
data.set('member_nick:사용중', 'other-member');

assert.equal((await post(uid, '사용중')).status, 409);
assert.equal((await post(uid, '옛이름')).status, 400);
assert.equal((await post(uid, '관리자')).status, 400);
assert.equal((await post(uid, '새이름', 'https://evil.example')).status, 403);
assert.equal((await post(otherUid, '새이름')).status, 403);

const changed = await post(uid, '새이름');
assert.equal(changed.status, 200);
const profile = (await changed.json()).profile;
assert.equal(profile.nick, '새이름');
assert.ok(profile.nickChangedAt > 0);
assert.equal(profile.nickChangeAvailableAt, profile.nickChangedAt + NICK_CHANGE_INTERVAL_MS);
assert.equal(data.get('member_nick:새이름'), memberId);
assert.equal(data.has('member_nick:옛이름'), false);
assert.equal(JSON.parse(data.get(memberKey)).nick, '새이름');

const cooldown = await post(uid, '다른이름');
assert.equal(cooldown.status, 429);
assert.equal((await cooldown.json()).error, 'cooldown');
assert.equal(data.has('member_nick:다른이름'), false);

data.set(memberKey, JSON.stringify({ ...JSON.parse(data.get(memberKey)), nickChangedAt: Date.now() - NICK_CHANGE_INTERVAL_MS - 1 }));
const changedAgain = await post(uid, '다른이름');
assert.equal(changedAgain.status, 200);
assert.equal(data.get('member_nick:다른이름'), memberId);
assert.equal(data.has('member_nick:새이름'), false);

console.log('member nickname cooldown regression: ok');
