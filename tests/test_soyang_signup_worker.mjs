import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../workers/auth-worker.js';

const secret = 'soyang-signup-test';
const uid = '123456789';
const exp = Math.floor(Date.now() / 1000) + 3600;
const signature = createHmac('sha256', secret).update(`mc2|${uid}|${exp}`).digest('hex').slice(0, 32);
const tok = `mc2.${exp}.${signature}`;
const store = new Map();
const env = { ADMIN_KEY: secret, PLACES: {
  get: async key => store.get(key) || null,
  put: async (key, value) => { store.set(key, value); },
} };
const ctx = { waitUntil() {} };
const url = 'https://mycanoe-map.kohoon0140.workers.dev/soyang-travers';
const submit = body => worker.fetch(new Request(url, {
  method: 'POST',
  headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: uid, tok, nick: '카카오명', agreed: true, privacyAgreed: true, name: '홍길동', phone: '010-0000-0000', ...body }),
}), env, ctx);

assert.equal((await submit({ userName: '카누맵이름' })).status, 200);
let saved = JSON.parse(store.get('soyang_traverse_signups'));
assert.equal(saved[0].userName, '카누맵이름');
assert.equal(Object.hasOwn(saved[0], 'cafeNick'), false);

// 배포 시점에 열려 있던 구형 신청 페이지의 제출도 잠시 호환한다.
assert.equal((await submit({ cafeNick: '이전이름' })).status, 200);
saved = JSON.parse(store.get('soyang_traverse_signups'));
assert.equal(saved.length, 1);
assert.equal(saved[0].userName, '이전이름');

console.log('Soyang participation username regression: ok');
