import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../workers/auth-worker.js';
import { normalizeRiverShare, riverShareHtml, riverShareId } from '../workers/river-share.mjs';

const river = normalizeRiverShare({ name: '북한강', lat: 38.1, lng: 127.8 });
assert.deepEqual(river, { name: '북한강', lat: 38.1, lng: 127.8 });
assert.equal(normalizeRiverShare({ name: '', lat: 38, lng: 127 }), null);
assert.equal(normalizeRiverShare({ name: '강', lat: 200, lng: 127 }), null);
const id = await riverShareId(river);
assert.match(id, /^r[0-9a-f]{20}$/);

const store = new Map();
const env = { ADMIN_KEY: 'test-only-admin-key', SITE_URL: 'https://canoe.crowdbase.kr/', PLACES: {
  get: async key => store.get(key) || null,
  put: async (key, value) => { store.set(key, value); },
} };
const image = 'data:image/jpeg;base64,' + readFileSync(new URL('../assets/course-previews/1.jpg', import.meta.url)).toString('base64');
const base = 'https://worker.example';
const post = body => worker.fetch(new Request(base + '/river-share', {
  method: 'POST', headers: { Origin: 'https://canoe.crowdbase.kr', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}), env, {});
assert.equal((await post({ ...river, img: image })).status, 403);
const saved = await post({ ...river, img: image, adminKey: env.ADMIN_KEY });
assert.equal(saved.status, 200);
const payload = await saved.json();
assert.equal(payload.id, id);
assert.equal(payload.url, base + '/r/' + id);
const share = await worker.fetch(new Request(payload.url), env, {});
assert.equal(share.status, 200);
const html = await share.text();
assert.match(html, /북한강 전체 물줄기 \| 카누맵/);
assert.ok(html.includes(`property="og:image" content="${base}/river-preview/${id}.jpg?v=`));
assert.ok(html.includes('riverAt=38.10000%2C127.80000'));
const preview = await worker.fetch(new Request(base + '/river-preview/' + id + '.jpg'), env, {});
assert.equal(preview.status, 200);
assert.equal(preview.headers.get('Content-Type'), 'image/jpeg');
assert.equal((await preview.arrayBuffer()).byteLength, readFileSync(new URL('../assets/course-previews/1.jpg', import.meta.url)).byteLength);
assert.equal((await worker.fetch(new Request(base + '/r/r00000000000000000000'), env, {})).status, 404);

const safe = riverShareHtml({ name: '<img src=x>', shareUrl: base + '/r/test', targetUrl: 'https://canoe.crowdbase.kr/', imageUrl: base + '/test.jpg' });
assert.ok(safe.includes('&lt;img src=x&gt;'));
assert.ok(!safe.includes('<img src=x>'));
console.log('river share preview regression: ok');
