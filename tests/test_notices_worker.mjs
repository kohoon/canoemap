import assert from 'node:assert/strict';
import worker from '../workers/auth-worker.js';

const data = new Map([['notices', '[]']]);
const env = {
  ADMIN_KEY: 'local-notice-test-key',
  SITE_URL: 'https://canoe.crowdbase.kr/',
  PLACES: {
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => { data.set(key, value); },
  },
};
const ctx = { waitUntil() {} };
const url = 'https://mycanoe-map.kohoon0140.workers.dev/notices';
const headers = { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' };
const request = (method, body) => worker.fetch(new Request(url, {
  method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
}), env, ctx);

const first = await request('GET');
assert.equal(first.status, 200);
assert.equal(first.headers.get('Cache-Control'), 'no-store');
assert.deepEqual(await first.json(), []);

const denied = await request('POST', { action: 'post', adminKey: 'wrong', title: '테스트', body: '내용' });
assert.equal(denied.status, 403);
assert.deepEqual(JSON.parse(data.get('notices')), []);

const created = await request('POST', { action: 'post', adminKey: env.ADMIN_KEY, title: '새 공지', body: '지금 확인' });
assert.equal(created.status, 200);
const saved = await created.json();
assert.equal(saved.ok, true);
assert.equal(saved.notices[0].title, '새 공지');
assert.equal((await (await request('GET')).json())[0].body, '지금 확인');

const edited = await request('POST', { action: 'edit', adminKey: env.ADMIN_KEY,
  noticeId: saved.notices[0].id, title: '수정한 공지', body: '수정 내용' });
assert.equal((await edited.json()).notices[0].title, '수정한 공지');

const deleted = await request('POST', { action: 'delete', adminKey: env.ADMIN_KEY, noticeId: saved.notices[0].id });
assert.deepEqual((await deleted.json()).notices, []);
assert.deepEqual(await (await request('GET')).json(), []);
console.log('notice write and immediate read: ok');
