import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'comment-ownership-test-secret';
const hmac = (value) => createHmac('sha256', secret).update(value).digest('hex');
const token = (uid) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `mc2.${exp}.${hmac(`mc2|${uid}|${exp}`).slice(0, 32)}`;
};
const data = new Map();
const kv = {
  get: async (key) => data.get(key) ?? null,
  put: async (key, value) => { data.set(key, value); },
  delete: async (key) => { data.delete(key); },
};
globalThis.caches = { default: { match: async () => null, put: async () => {}, delete: async () => true } };
const env = { ADMIN_KEY: secret, SITE_URL: 'https://canoe.crowdbase.kr/', PLACES: kv };
const ctx = { waitUntil() {} };
const base = 'https://mycanoe-map.kohoon0140.workers.dev/comments';
for (const [uid, nick] of [['user-a', '작성자'], ['user-b', '다른회원']]) {
  data.set(`member:${hmac(`member-key|${uid}`).slice(0, 32)}`,
    JSON.stringify({ status: 'active', nick, memberId: hmac(`member-id|${uid}`).slice(0, 16) }));
}
const post = (body) => worker.fetch(new Request(base, {
  method: 'POST', headers: { Origin: env.SITE_URL, 'Content-Type': 'application/json' },
  body: JSON.stringify({ place: 'course_c1', ...body }),
}), env, ctx);
const get = (uid) => worker.fetch(new Request(base + '?place=course_c1', {
  headers: uid ? { 'X-User-Id': uid, 'X-Auth-Token': token(uid), Origin: env.SITE_URL } : {},
}), env, ctx);
const asUser = (uid) => ({ id: uid, tok: token(uid) });
const audit = () => [...data.entries()].filter(([key]) => key.startsWith('cmt_audit:')).map(([, value]) => JSON.parse(value));
const preflight = await worker.fetch(new Request(base, { method: 'OPTIONS', headers: {
  Origin: env.SITE_URL, 'Access-Control-Request-Method': 'GET',
  'Access-Control-Request-Headers': 'x-user-id,x-auth-token',
} }), env, ctx);
assert.equal(preflight.status, 200);
assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-User-Id, X-Auth-Token/);

const created = await post({ ...asUser('user-a'), nick: '속인 닉네임', text: '첫 내용' });
assert.equal(created.status, 200);
let row = (await created.json()).comments.list[0];
assert.equal(row.nick, '작성자');
assert.equal(row.mine, true);
assert.equal(row.ownerId, undefined);
const cid = row.id;
assert.equal((await (await get('user-a')).json()).list[0].mine, true);
assert.equal((await (await get('user-b')).json()).list[0].mine, false);
assert.equal((await (await get()).json()).list[0].ownerId, undefined);

assert.equal((await post({ ...asUser('user-b'), action: 'cmtedit', cid, text: '침입' })).status, 403);
assert.equal((await post({ ...asUser('user-b'), action: 'cmtdel', cid })).status, 403);
assert.equal(audit().length, 1);

const edited = await post({ ...asUser('user-a'), action: 'cmtedit', cid, rev: 1, text: '고친 내용' });
assert.equal(edited.status, 200);
row = (await edited.json()).comments.list[0];
assert.equal(row.text, '고친 내용');
assert.equal(row.rev, 2);
assert.equal((await post({ ...asUser('user-a'), action: 'cmtdel', cid, rev: 1 })).status, 409);
assert.equal((await post({ ...asUser('user-a'), action: 'cmtdel', cid, rev: 2 })).status, 200);
assert.equal(audit().length, 3);
assert.deepEqual(audit().map((event) => event.action).sort(), ['create', 'delete', 'edit']);
assert(audit().every((event) => event.status === 'applied'));
assert.equal(audit().find((event) => event.action === 'edit').before.text, '첫 내용');
assert.equal(audit().find((event) => event.action === 'delete').before.text, '고친 내용');

data.set('cmt:course_c1', JSON.stringify({ admin: '', list: [{ id: 100, nick: '작성자', text: '옛 댓글', t: 1 }] }));
assert.equal((await (await get('user-a')).json()).list[0].mine, false);
assert.equal((await post({ ...asUser('user-a'), action: 'cmtedit', cid: 100, text: '내 글' })).status, 403);
assert.equal((await post({ adminKey: secret, action: 'cmtedit', cid: 100, text: '관리자 수정' })).status, 200);
assert.equal(audit().length, 4);
console.log('comment ownership and audit regression: ok');
